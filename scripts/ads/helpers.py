from collections import defaultdict
import os
from typing import Any, Generator
from pathlib import Path
from dotenv import load_dotenv
from pydantic import UUID4
from selenium import webdriver
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from typing import List
import supabase
from tqdm import tqdm

from models import (
    AdAnalysis,
    AdMetric,
    AdStructuredOutput,
    Feature,
    GoogleAd,
    JoinedFeatureMetric,
    SentimentAnalysis,
    VisualAttribute,
)


root_dir = Path(__file__).resolve().parents[2]
env_path = root_dir / '.env.local'

# Load the environment variables
load_dotenv(env_path)

def create_driver(headless: bool = True) -> WebDriver:
    chrome_options = Options()
    if headless:
        chrome_options.add_argument("--headless")
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()), options=chrome_options
    )
    return driver


def get_supabase_client():
    return supabase.create_client(
        os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
        os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    )


def get_ad_data_from_db() -> List[GoogleAd]:
    supabase_client = get_supabase_client()
    offset, batch_size = 0, 1000
    ads: List[GoogleAd] = []
    while True:
        new_ads: List[GoogleAd] = [
            GoogleAd.model_validate(ad)
            for ad in supabase_client.table("google_image_ads")
            .select("*")
            .range(offset, offset + batch_size)
            .execute()
            .data
        ]
        ads.extend(new_ads)
        if len(new_ads) < batch_size:
            break
        offset += batch_size
    return ads


def get_ad_structured_outputs_from_db() -> List[AdStructuredOutput]:
    supabase_client = get_supabase_client()
    offset, batch_size = 0, 1000
    analyses: List[AdStructuredOutput] = []
    while True:
        new_analyses: List[AdStructuredOutput] = [
            AdStructuredOutput.model_validate(analysis)
            for analysis in supabase_client.table("ad_structured_output")
            .select("*")
            .range(offset, offset + batch_size)
            .execute()
            .data
        ]
        analyses.extend(new_analyses)
        if len(new_analyses) < batch_size:
            break
        offset += batch_size
    return analyses


def get_ad_analyses_from_db() -> List[AdAnalysis]:
    supabase_client = get_supabase_client()
    offset, batch_size = 0, 1000
    analyses: List[AdAnalysis] = []
    while True:
        raw_analyses: list[dict[str, Any]] = (
            supabase_client.table("ad_structured_output")
            .select(
                "id, image_description, image_url, features(id, ad_output_id, keyword, confidence_score, category, location, visual_attributes(id, feature_id, attribute, value)), sentiment_analysis(id, ad_output_id, tone, confidence)"
            )
            .range(offset, offset + batch_size)
            .execute()
            .data
        )
        new_analyses: list[AdAnalysis] = [
            AdAnalysis.model_validate(analysis) for analysis in raw_analyses
        ]
        analyses.extend(new_analyses)
        if len(new_analyses) < batch_size:
            break
        offset += batch_size
    return analyses


def get_features_and_metrics_from_db() -> List[JoinedFeatureMetric]:
    supabase_client = get_supabase_client()
    offset, batch_size = 0, 1000
    features: list[Feature] = []
    metrics: list[AdMetric] = []
    while True:
        new_features: list[Feature] = [
            Feature.model_validate(feature)
            for feature in supabase_client.table("features")
            .select("*")
            .range(offset, offset + batch_size)
            .execute()
            .data
        ]
        features.extend(new_features)
        if len(new_features) < batch_size:
            break
        offset += batch_size
    offset = 0
    while True:
        new_metrics: list[AdMetric] = [
            AdMetric.model_validate(metric)
            for metric in supabase_client.table("ad_metrics")
            .select("*")
            .range(offset, offset + batch_size)
            .execute()
            .data
        ]
        metrics.extend(new_metrics)
        if len(new_metrics) < batch_size:
            break
        offset += batch_size

    print(len(features), len(metrics))

    grouped_features: dict[UUID4, list[Feature]] = defaultdict(list)
    for feature in features:
        grouped_features[feature.ad_output_id].append(feature)

    joined_features: list[JoinedFeatureMetric] = []
    for metric in metrics:
        for feature in grouped_features[metric.ad_id]:
            joined_features.append(
                JoinedFeatureMetric(
                    ad_output_id=metric.ad_id,
                    clicks=metric.clicks,
                    impressions=metric.impressions,
                    ctr=metric.ctr,
                    keyword=feature.keyword,
                    confidence_score=feature.confidence_score,
                    category=feature.category,
                    location=feature.location,
                )
            )
    return joined_features
