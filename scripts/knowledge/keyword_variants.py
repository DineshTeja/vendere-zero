from typing import List, Dict, Any, Optional, Tuple
import os
import json
import asyncio
import numpy as np
from pydantic import BaseModel, Field
from pathlib import Path
from dotenv import load_dotenv
import logging
from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
from sklearn.metrics.pairwise import cosine_similarity  # type: ignore
from supabase.client import create_client, ClientOptions
import datetime
import csv
import uuid
import re
import random
import aiohttp
import traceback
import pandas as pd
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI
from supabase import create_client

# Import LlamaIndex components
from llama_index.core import VectorStoreIndex, Document
from llama_index.core.storage import StorageContext
from llama_index.vector_stores.supabase import SupabaseVectorStore
from llama_index.llms.openai import OpenAI

# Load environment variables
env_path = Path(__file__).parents[2] / ".env.local"
load_dotenv(env_path)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AdFeatures(BaseModel):
    """Extracted features from Nike display ad"""

    visual_cues: List[str]
    pain_points: List[str]
    visitor_intent: str
    target_audience: Dict[str, Any]
    product_category: Optional[str] = None
    campaign_objective: Optional[str] = None
    image_url: Optional[str] = None


class KeywordVariant(BaseModel):
    """Generated keyword variant with metrics"""

    keyword: str
    source: str  # "retrieved" or "generated"
    search_volume: int = 0
    cpc: float = 0.0
    keyword_difficulty: float = 0.0
    competition_percentage: float = 0.0
    efficiency_index: float = 0.0  # composite metric
    confidence_score: float = 0.0  # confidence in the metric estimates
    similar_keywords: List[Dict] = []  # List of similar keywords from database
    explanation: str = ""
    image_url: Optional[str] = None  # URL of the image associated with this keyword


class KeywordVariantGenerator:
    """Generator for keyword variants based on ad features"""

    def __init__(self):
        """Initialize the generator with caching and batch processing capabilities"""
        # Initialize caches
        self.cache = {}
        self.batch_size = 50
        self.similar_content_cache = {}
        self.metrics_cache = {}

        # Initialize Supabase client
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        supabase_anon_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

        if not supabase_url or (not supabase_service_key and not supabase_anon_key):
            raise ValueError("Missing required Supabase environment variables")

        # Use service key if available, otherwise use anon key
        supabase_key = supabase_service_key or supabase_anon_key

        logger.info(
            "Initializing Supabase client with %s key",
            "service" if supabase_service_key else "anon",
        )

        try:
            self.supabase = create_client(
                supabase_url, supabase_key, options={"postgrest_client_timeout": 60}
            )

            # Initialize LLM
            self.llm = OpenAI(temperature=0.7, model="gpt-4-turbo-preview")

            # Initialize keyword data
            self._initialize_keyword_data()

            logger.info("KeywordVariantGenerator initialized successfully")

        except Exception as e:
            logger.error("Error initializing KeywordVariantGenerator: %s", str(e))
            raise

    def _initialize_keyword_data(self):
        """Initialize keyword data and similarity models"""
        try:
            # Fetch keyword data from Supabase
            result = self.supabase.table("semrush_keywords").select("*").execute()
            self.semrush_keywords = result.data if result.data else []

            # Create keyword data map for quick lookups
            self.keyword_data_map = {
                item["keyword"].lower(): item
                for item in self.semrush_keywords
                if "keyword" in item
            }

            # Initialize similarity models if we have keywords
            if self.semrush_keywords:
                keywords = [
                    item["keyword"]
                    for item in self.semrush_keywords
                    if "keyword" in item
                ]

                # Character-level vectorizer
                self.char_vectorizer = TfidfVectorizer(
                    analyzer="char_wb", ngram_range=(2, 5)
                )
                self.char_vectors = self.char_vectorizer.fit_transform(keywords)

                # Word-level vectorizer
                self.word_vectorizer = TfidfVectorizer(
                    analyzer="word", ngram_range=(1, 2)
                )
                self.word_vectors = self.word_vectorizer.fit_transform(keywords)

                logger.info(
                    "Initialized similarity models with %d keywords", len(keywords)
                )
            else:
                logger.warning("No keywords found in database for similarity models")
                # Initialize empty data structures as fallback
                self.char_vectorizer = None
                self.word_vectors = None
                self.char_vectors = None
                self.word_vectorizer = None

        except Exception as e:
            logger.error("Error initializing keyword data: %s", str(e))
            # Initialize empty data structures as fallback
            self.semrush_keywords = []
            self.keyword_data_map = {}
            self.char_vectorizer = None
            self.word_vectors = None
            self.char_vectors = None
            self.word_vectorizer = None

    async def _generate_keyword_variants(self, ad_features: AdFeatures) -> List[str]:
        """Generate new keyword variants using LLM with improved prompting"""
        try:
            cache_key = f"{ad_features.image_url}_{ad_features.visitor_intent}"
            if cache_key in self.cache:
                return self.cache[cache_key]

            # Get similar content with caching
            if cache_key not in self.similar_content_cache:
                self.similar_content_cache[cache_key] = (
                    await self._incorporate_joined_data(ad_features)
                )
            joined_data = self.similar_content_cache[cache_key]

            # Extract additional keywords from joined data
            additional_keywords = joined_data.get("keywords", []) if joined_data else []

            # Construct an improved prompt that leverages visual information and similar ads
            prompt = f"""
            Generate diverse and highly relevant keyword variants for a display ad. Focus on commercial intent and user search behavior.

            Ad Details:
            - Visual Elements: {', '.join(ad_features.visual_cues)}
            - Pain Points: {', '.join(ad_features.pain_points)}
            - User Intent: {ad_features.visitor_intent}
            - Target Audience: {json.dumps(ad_features.target_audience, indent=2)}
            - Product Category: {ad_features.product_category or "General"}
            - Campaign Goal: {ad_features.campaign_objective or "Brand Awareness"}

            Similar Successful Ads:
            {json.dumps(joined_data.get('features', []), indent=2) if joined_data else "No similar ads found"}

            Existing Keywords:
            {json.dumps(additional_keywords, indent=2) if additional_keywords else "No existing keywords"}

            Generate 4 sets of keywords (10 keywords each):
            1. High commercial intent keywords (focus on purchase-ready users)
            2. Problem-solution keywords (address pain points)
            3. Brand awareness keywords (focus on discovery and research)
            4. Long-tail specific keywords (detailed, low competition)

            Format the response as a JSON object with a 'keywords' array containing unique keyword strings.
            Ensure keywords are:
            - Relevant to the visual content and ad context
            - Match user search intent
            - Have commercial potential
            - Include a mix of head terms and long-tail variations
            """

            # Make async call to GPT-4
            response = await self.llm.agenerate(prompt)

            # Parse and process keywords
            try:
                generated_data = json.loads(response.text)
                keywords = generated_data.get("keywords", [])

                # Clean and deduplicate keywords
                keywords = list(set([str(kw).strip().lower() for kw in keywords if kw]))

                # Add unique keywords from similar ads
                if additional_keywords:
                    all_keywords = keywords + [k.lower() for k in additional_keywords]
                    keywords = list(set(all_keywords))

                # Cache the results
                self.cache[cache_key] = keywords

                return keywords

            except json.JSONDecodeError:
                logger.error("Failed to parse LLM response as JSON")
                return []

        except Exception as e:
            logger.error(f"Error in _generate_keyword_variants: {str(e)}")
            return []

    async def _estimate_metrics_batch(self, keywords: List[str]) -> List[Dict]:
        """Estimate metrics for multiple keywords in parallel"""
        try:
            results = []
            tasks = []

            # Process keywords in batches
            for i in range(0, len(keywords), self.batch_size):
                batch = keywords[i : i + self.batch_size]
                batch_tasks = []

                for keyword in batch:
                    if keyword in self.metrics_cache:
                        results.append(self.metrics_cache[keyword])
                    else:
                        # Find similar keywords
                        similar = self._find_similar_keywords(keyword)
                        # Create task for metric estimation
                        task = asyncio.create_task(
                            self._estimate_single_keyword_metrics(keyword, similar)
                        )
                        batch_tasks.append((keyword, task))

                # Wait for batch to complete
                if batch_tasks:
                    batch_results = await asyncio.gather(*[t[1] for t in batch_tasks])

                    # Cache and store results
                    for (keyword, _), metrics in zip(batch_tasks, batch_results):
                        self.metrics_cache[keyword] = metrics
                        results.append(metrics)

            return results

        except Exception as e:
            logger.error(f"Error in _estimate_metrics_batch: {str(e)}")
            return []

    async def _estimate_single_keyword_metrics(
        self, keyword: str, similar_keywords: List[Dict]
    ) -> Dict:
        """Estimate metrics for a single keyword with improved accuracy"""
        try:
            # Use weighted average based on similarity scores
            metrics = {
                "search_volume": 0,
                "cpc": 0.0,
                "keyword_difficulty": 0.0,
                "competition_percentage": 0.0,
                "confidence_score": 0.0,
            }

            total_weight = 0

            for similar in similar_keywords:
                weight = similar["similarity"]
                total_weight += weight

                metrics["search_volume"] += similar["metrics"]["search_volume"] * weight
                metrics["cpc"] += similar["metrics"]["cpc"] * weight
                metrics["keyword_difficulty"] += (
                    similar["metrics"]["keyword_difficulty"] * weight
                )
                metrics["competition_percentage"] += (
                    similar["metrics"]["competition"] * weight
                )

            if total_weight > 0:
                for key in metrics:
                    if key != "confidence_score":
                        metrics[key] = metrics[key] / total_weight

            # Adjust metrics based on keyword characteristics
            metrics = await self._adjust_metrics_based_on_characteristics(
                keyword, metrics
            )

            # Set confidence score based on similar keywords quality
            metrics["confidence_score"] = min(
                0.95, 0.3 + (0.15 * len(similar_keywords))
            )

            return metrics

        except Exception as e:
            logger.error(f"Error estimating metrics for {keyword}: {str(e)}")
            return {
                "search_volume": 100,
                "cpc": 1.0,
                "keyword_difficulty": 50.0,
                "competition_percentage": 0.5,
                "confidence_score": 0.3,
            }

    async def _adjust_metrics_based_on_characteristics(
        self, keyword: str, metrics: Dict
    ) -> Dict:
        """Adjust metrics based on keyword characteristics using ML-based approach"""
        try:
            word_count = len(keyword.split())
            contains_brand = "nike" in keyword.lower()
            is_question = any(
                q in keyword.lower()
                for q in ["how", "what", "why", "when", "where", "which"]
            )

            # Apply ML-based adjustments (simplified version)
            if word_count > 3:  # Long-tail
                metrics["search_volume"] *= 0.7
                metrics["competition_percentage"] *= 0.8
                metrics["keyword_difficulty"] *= 0.85
                metrics["cpc"] *= 1.2  # Often higher intent

            if contains_brand:
                metrics["search_volume"] *= 1.3
                metrics["competition_percentage"] *= 1.2
                metrics["keyword_difficulty"] *= 1.1

            if is_question:
                metrics["search_volume"] *= 0.8
                metrics["cpc"] *= 0.9
                metrics["competition_percentage"] *= 0.7

            return metrics

        except Exception as e:
            logger.error(f"Error adjusting metrics for {keyword}: {str(e)}")
            return metrics

    async def generate_keyword_variants(
        self, ad_features: AdFeatures, specific_keyword: Optional[str] = None
    ) -> List[KeywordVariant]:
        """Generate keyword variants with improved performance and quality"""
        try:
            # Generate or use specific keywords
            keywords_to_process = (
                [specific_keyword]
                if specific_keyword
                else await self._generate_keyword_variants(ad_features)
            )

            if not keywords_to_process:
                return []

            # Process keywords in parallel
            metrics_results = await self._estimate_metrics_batch(keywords_to_process)

            # Create KeywordVariant objects
            variants = []
            for keyword, metrics in zip(keywords_to_process, metrics_results):
                variant = KeywordVariant(
                    keyword=keyword,
                    source="generated",
                    search_volume=metrics["search_volume"],
                    cpc=metrics["cpc"],
                    keyword_difficulty=metrics["keyword_difficulty"],
                    competition_percentage=metrics["competition_percentage"],
                    confidence_score=metrics["confidence_score"],
                    image_url=ad_features.image_url,
                )
                variants.append(variant)

            # Calculate composite metrics in parallel
            variants = await self._calculate_composite_metrics(variants)

            # Generate explanations in batches
            variants = await self._generate_explanations_batch(variants, ad_features)

            # Rank and return top variants
            ranked_variants = await self._rank_and_prioritize(variants)

            return ranked_variants

        except Exception as e:
            logger.error(f"Error in generate_keyword_variants: {str(e)}")
            return []

    async def _generate_explanations_batch(
        self, variants: List[KeywordVariant], ad_features: AdFeatures
    ) -> List[KeywordVariant]:
        """Generate explanations for keywords in batches"""
        try:
            for i in range(0, len(variants), self.batch_size):
                batch = variants[i : i + self.batch_size]

                # Create prompt for batch
                keywords_info = [
                    {
                        "keyword": v.keyword,
                        "metrics": {
                            "search_volume": v.search_volume,
                            "cpc": v.cpc,
                            "difficulty": v.keyword_difficulty,
                        },
                    }
                    for v in batch
                ]

                prompt = f"""
                Analyze these keywords in the context of a display ad campaign:
                
                Ad Context:
                - Intent: {ad_features.visitor_intent}
                - Audience: {json.dumps(ad_features.target_audience)}
                - Pain Points: {ad_features.pain_points}
                
                Keywords:
                {json.dumps(keywords_info, indent=2)}
                
                For each keyword, provide a brief explanation of:
                1. Why it's relevant to the ad
                2. The user intent it targets
                3. Its potential effectiveness
                
                Format: JSON object with keyword-explanation pairs
                """

                try:
                    response = await self.llm.agenerate(prompt)
                    explanations = json.loads(response.text)

                    # Update variants with explanations
                    for variant in batch:
                        variant.explanation = explanations.get(
                            variant.keyword,
                            f"Keyword targeting {ad_features.visitor_intent} audience.",
                        )

                except Exception as e:
                    logger.error(f"Error generating explanations for batch: {str(e)}")
                    # Set default explanations
                    for variant in batch:
                        variant.explanation = (
                            f"Keyword targeting {ad_features.visitor_intent} audience."
                        )

            return variants

        except Exception as e:
            logger.error(f"Error in _generate_explanations_batch: {str(e)}")
            return variants

    async def _retrieve_similar_content(self, ad_features: AdFeatures) -> List[Dict]:
        """Retrieve similar ad content from combined market research and library items data"""
        try:
            # Construct a query based on ad features
            query = f"""
            Find content similar to the following ad features:
            
            Visual Cues: {', '.join(ad_features.visual_cues)}
            Pain Points: {', '.join(ad_features.pain_points)}
            Visitor Intent: {ad_features.visitor_intent}
            Target Audience: {json.dumps(ad_features.target_audience, indent=2)}
            {f"Product Category: {ad_features.product_category}" if ad_features.product_category else ""}
            {f"Campaign Objective: {ad_features.campaign_objective}" if ad_features.campaign_objective else ""}
            
            Return the most relevant combined market research and library items that could help generate keywords.
            Focus on content that includes keywords, target audience information, and pain points.
            """

            # Query the vector index
            response = self.query_engine.query(query)

            # Process the response to extract content and keywords
            similar_content = []

            # If the response is structured, we can parse it directly
            if hasattr(response, "metadata") and isinstance(response.metadata, dict):
                # Extract structured data if available
                for item in response.metadata.get("similar_content", []):
                    similar_content.append(item)
            else:
                # If the response is unstructured text, we need to parse it
                # Use the LLM to extract structured information from the text
                extraction_prompt = f"""
                Extract structured information about combined ad content from the following text:
                
                {str(response)}
                
                Format the output as a JSON array of objects, where each object represents content with:
                - mr_id: market research ID (if available)
                - li_id: library item ID (if available)
                - image_url: the shared image URL (if available)
                - visual_cues: array of visual elements (if available)
                - pain_points: array of pain points addressed (if available)
                - visitor_intent: the primary visitor intent (if available)
                - target_audience: object with audience characteristics (if available)
                - keywords: array of keywords associated with the content (if available)
                - features: array of features from the library item (if available)
                - sentiment_tones: array of sentiment tones from the library item (if available)
                
                Return only the JSON array.
                """

                extraction_response = self.llm.complete(
                    extraction_prompt, response_format={"type": "json_object"}
                )

                # Parse the JSON response
                try:
                    extracted_data = json.loads(extraction_response.text)
                    similar_content = extracted_data.get("content", [])
                except json.JSONDecodeError:
                    logger.error("Failed to parse LLM response as JSON")
                    similar_content = []

            # If we didn't get any content from the vector search, try direct database queries
            if not similar_content:
                logger.info("No content from vector search, trying direct RPC query")

                # Try to find joined data with similar keywords
                query_terms = []
                if ad_features.product_category:
                    query_terms.append(ad_features.product_category)
                query_terms.extend(ad_features.visual_cues[:2])
                query_terms.extend(ad_features.pain_points[:2])

                # Use the RPC function to get joined data
                logger.info(
                    "Calling RPC function 'join_market_research_and_library_items' from _retrieve_similar_content"
                )
                try:
                    joined_data_response = self.supabase.rpc(
                        "join_market_research_and_library_items"
                    ).execute()
                    joined_data = joined_data_response.data
                    logger.info(
                        f"RPC function returned {len(joined_data) if joined_data else 0} records"
                    )
                except Exception as e:
                    logger.error(
                        f"Error calling RPC function from _retrieve_similar_content: {str(e)}"
                    )
                    joined_data = []

                # Filter the joined data manually based on query terms
                filtered_data = []
                for entry in joined_data:
                    # Check if any query term is in the intent summary or features
                    intent_summary = entry.get("mr_intent_summary", "").lower()
                    features = [f.lower() for f in entry.get("li_features", [])]

                    for term in query_terms:
                        term_lower = term.lower()
                        if term_lower in intent_summary or any(
                            term_lower in feature for feature in features
                        ):
                            filtered_data.append(entry)
                            break

                # Limit to top 5 results
                filtered_data = filtered_data[:5]

                # Process filtered results
                for entry in filtered_data:
                    # Extract keywords from market research
                    keywords = []
                    if entry.get("mr_keywords"):
                        for kw_obj in entry.get("mr_keywords", []):
                            if isinstance(kw_obj, dict) and "text" in kw_obj:
                                keywords.append(kw_obj["text"])
                            elif isinstance(kw_obj, str):
                                keywords.append(kw_obj)

                    content_item = {
                        "mr_id": entry.get("mr_id"),
                        "li_id": entry.get("li_id"),
                        "image_url": entry.get("mr_image_url"),
                        "intent_summary": entry.get("mr_intent_summary"),
                        "target_audience": entry.get("mr_target_audience"),
                        "pain_points": entry.get("mr_pain_points"),
                        "keywords": keywords,
                        "features": entry.get("li_features", []),
                        "sentiment_tones": entry.get("li_sentiment_tones", []),
                    }
                    similar_content.append(content_item)

            # Extract keywords from the similar content
            retrieved_keywords = []

            for content in similar_content:
                # Extract keywords from content
                if content.get("keywords"):
                    keywords = content.get("keywords", [])
                    if isinstance(keywords, list):
                        for kw in keywords:
                            if isinstance(kw, dict) and "text" in kw:
                                retrieved_keywords.append(kw["text"])
                            elif isinstance(kw, str):
                                retrieved_keywords.append(kw)

                # Use features as potential keywords
                if content.get("features"):
                    features = content.get("features", [])
                    if isinstance(features, list):
                        for feature in features:
                            if (
                                isinstance(feature, str) and len(feature.split()) <= 3
                            ):  # Only use short features as keywords
                                retrieved_keywords.append(feature)

            # Deduplicate keywords
            retrieved_keywords = list(set(retrieved_keywords))

            # Create a list of content items with keywords
            content_with_keywords = []
            for content in similar_content:
                content_keywords = []

                # Extract keywords from content
                if content.get("keywords"):
                    keywords = content.get("keywords", [])
                    if isinstance(keywords, list):
                        for kw in keywords:
                            if isinstance(kw, dict) and "text" in kw:
                                content_keywords.append(kw["text"])
                            elif isinstance(kw, str):
                                content_keywords.append(kw)

                # Use features as keywords
                if content.get("features"):
                    features = content.get("features", [])
                    if isinstance(features, list):
                        for feature in features:
                            if isinstance(feature, str) and len(feature.split()) <= 3:
                                content_keywords.append(feature)

                # Only add content that has keywords
                if content_keywords:
                    content_with_keywords.append(
                        {
                            "mr_id": content.get("mr_id"),
                            "li_id": content.get("li_id"),
                            "image_url": content.get("image_url"),
                            "keywords": content_keywords,
                            "target_audience": content.get("target_audience", {}),
                            "pain_points": content.get("pain_points", {}),
                            "features": content.get("features", []),
                            "sentiment_tones": content.get("sentiment_tones", []),
                        }
                    )

            logger.info(
                f"Retrieved {len(content_with_keywords)} similar content items with {len(retrieved_keywords)} keywords"
            )
            return content_with_keywords

        except Exception as e:
            logger.error(f"Error in _retrieve_similar_content: {str(e)}")
            return []

    async def _incorporate_joined_data(
        self, ad_features: AdFeatures
    ) -> Dict[str, List]:
        """Retrieve and incorporate relevant joined market research and library items data"""
        try:
            # Construct a query to find relevant joined data based on ad features
            query_terms = []

            # Add product category if available
            if ad_features.product_category:
                query_terms.append(ad_features.product_category)

            # Add visitor intent
            query_terms.append(ad_features.visitor_intent)

            # Add some pain points
            for pain in ad_features.pain_points[:2]:
                query_terms.append(pain)

            # Add some visual cues
            for cue in ad_features.visual_cues[:2]:
                query_terms.append(cue)

            # Use the RPC function to get joined data
            logger.info(
                "Calling RPC function 'join_market_research_and_library_items' from _incorporate_joined_data"
            )
            try:
                joined_data_response = self.supabase.rpc(
                    "join_market_research_and_library_items"
                ).execute()
                joined_data = joined_data_response.data
                logger.info(
                    f"RPC function returned {len(joined_data) if joined_data else 0} records"
                )
            except Exception as e:
                logger.error(
                    f"Error calling RPC function from _incorporate_joined_data: {str(e)}"
                )
                joined_data = []

            if not joined_data:
                logger.warning("No joined data found")
                return {}

            # Filter the joined data manually based on query terms
            filtered_data = []
            for entry in joined_data:
                # Check if any query term is in the intent summary or features
                intent_summary = entry.get("mr_intent_summary", "").lower()
                features = [f.lower() for f in entry.get("li_features", [])]

                for term in query_terms:
                    term_lower = term.lower()
                    if term_lower in intent_summary or any(
                        term_lower in feature for feature in features
                    ):
                        filtered_data.append(entry)
                        break

            # Limit to top 5 results
            filtered_data = filtered_data[:5]

            if not filtered_data:
                logger.warning("No relevant joined data found after filtering")
                return {}

            logger.info(f"Found {len(filtered_data)} relevant joined entries")

            # Extract and combine relevant information
            combined_data: Dict[str, List] = {
                "intent_summaries": [],
                "target_audiences": [],
                "pain_points": [],
                "key_features": [],
                "competitive_advantages": [],
                "keywords": [],
                "features": [],
                "sentiment_tones": [],
                "image_urls": [],
            }

            for entry in filtered_data:
                # Add intent summary
                if entry.get("mr_intent_summary"):
                    combined_data["intent_summaries"].append(entry["mr_intent_summary"])

                # Add target audience information
                if entry.get("mr_target_audience"):
                    combined_data["target_audiences"].append(
                        entry["mr_target_audience"]
                    )

                # Add pain points
                if entry.get("mr_pain_points"):
                    combined_data["pain_points"].append(entry["mr_pain_points"])

                # Add key features
                if entry.get("mr_key_features"):
                    combined_data["key_features"].append(entry["mr_key_features"])

                # Add competitive advantages
                if entry.get("mr_competitive_advantages"):
                    combined_data["competitive_advantages"].append(
                        entry["mr_competitive_advantages"]
                    )

                # Add keywords if available
                if entry.get("mr_keywords"):
                    for kw_obj in entry["mr_keywords"]:
                        if isinstance(kw_obj, dict) and "text" in kw_obj:
                            combined_data["keywords"].append(kw_obj["text"])
                        elif isinstance(kw_obj, str):
                            combined_data["keywords"].append(kw_obj)

                # Add features from library items
                if entry.get("li_features"):
                    for feature in entry["li_features"]:
                        if feature not in combined_data["features"]:
                            combined_data["features"].append(feature)

                # Add sentiment tones
                if entry.get("li_sentiment_tones"):
                    for tone in entry["li_sentiment_tones"]:
                        if tone not in combined_data["sentiment_tones"]:
                            combined_data["sentiment_tones"].append(tone)

                # Add image URL
                if (
                    entry.get("mr_image_url")
                    and entry["mr_image_url"] not in combined_data["image_urls"]
                ):
                    combined_data["image_urls"].append(entry["mr_image_url"])

            # Deduplicate keywords
            combined_data["keywords"] = list(set(combined_data["keywords"]))

            return combined_data

        except Exception as e:
            logger.error(f"Error incorporating joined data: {str(e)}")
            return {}

    def _find_similar_keywords(self, keyword: str, top_n: int = 5) -> List[Dict]:
        """Find the most similar keywords using multiple similarity measures"""
        try:
            # Check if the keyword exists exactly in our database
            if keyword.lower() in self.keyword_data_map:
                # Return the exact match with 100% similarity
                exact_match = self.keyword_data_map[keyword.lower()]
                return [
                    {
                        "keyword": keyword.lower(),
                        "similarity": 1.0,
                        "metrics": {
                            "search_volume": exact_match.get("search_volume", 0),
                            "cpc": exact_match.get("cpc", 0.0),
                            "keyword_difficulty": exact_match.get(
                                "keyword_difficulty", 0.0
                            ),
                            "competition": exact_match.get("competition", 0.0),
                        },
                    }
                ]

            # Transform the input keyword for both similarity measures
            # Character-level similarity (good for typos and small variations)
            char_vector = self.char_vectorizer.transform([keyword])
            char_similarities = cosine_similarity(
                char_vector, self.char_vectors
            ).flatten()

            # Word-level similarity (good for word order and synonyms)
            word_vector = self.word_vectorizer.transform([keyword])
            word_similarities = cosine_similarity(
                word_vector, self.word_vectors
            ).flatten()

            # Combine similarities with different weights
            # Character similarity is good for catching typos and minor variations
            # Word similarity is better for semantic meaning
            combined_similarities = (char_similarities * 0.4) + (
                word_similarities * 0.6
            )

            # Get indices of top N similar keywords
            top_indices = combined_similarities.argsort()[-top_n:][::-1]

            # Get the similar keywords and their similarity scores
            similar_keywords = []
            for idx in top_indices:
                similarity_score = float(combined_similarities[idx])
                if (
                    similarity_score > 0.3
                ):  # Only include if similarity is above threshold
                    keyword_data = self.semrush_keywords[idx]
                    similar_keywords.append(
                        {
                            "keyword": keyword_data.get("keyword", ""),
                            "similarity": similarity_score,
                            "metrics": {
                                "search_volume": keyword_data.get("search_volume", 0),
                                "cpc": keyword_data.get("cpc", 0.0),
                                "keyword_difficulty": keyword_data.get(
                                    "keyword_difficulty", 0.0
                                ),
                                "competition": keyword_data.get("competition", 0.0),
                            },
                        }
                    )

            logger.info(
                f"Found {len(similar_keywords)} similar keywords for '{keyword}'"
            )
            return similar_keywords

        except Exception as e:
            logger.error(f"Error in _find_similar_keywords for '{keyword}': {str(e)}")
            return []

    def _estimate_metrics(self, keyword: str, similar_keywords: List[Dict]) -> Dict:
        """Estimate metrics for a keyword based on similar keywords"""
        try:
            if not similar_keywords:
                # Default values for keywords with no similar matches
                return {
                    "search_volume": 100,  # Conservative estimate
                    "cpc": 1.0,
                    "keyword_difficulty": 50.0,
                    "competition_percentage": 0.5,  # Changed from "competition" to "competition_percentage"
                    "confidence_score": 0.2,  # Low confidence if no similar keywords
                }

            # Calculate average metrics from similar keywords
            search_volume = 0
            cpc = 0.0
            keyword_difficulty = 0.0
            competition = 0.0
            confidence = 0.0
            num_valid_metrics = 0

            for similar in similar_keywords:
                metrics = similar.get("metrics", {})
                if metrics:
                    search_volume += int(metrics.get("search_volume", 0))
                    cpc += float(metrics.get("cpc", 0.0))
                    keyword_difficulty += float(metrics.get("keyword_difficulty", 0.0))
                    competition += float(metrics.get("competition", 0.0))
                    num_valid_metrics += 1

            # Calculate averages if we have valid metrics
            if num_valid_metrics > 0:
                search_volume = int(search_volume / num_valid_metrics)
                cpc = float(cpc / num_valid_metrics)
                keyword_difficulty = float(keyword_difficulty / num_valid_metrics)
                competition = float(competition / num_valid_metrics)
                # More similar keywords means higher confidence
                confidence = float(min(0.9, 0.3 + (0.1 * num_valid_metrics)))
            else:
                # Default values if metrics parsing failed
                search_volume = 100
                cpc = 1.0
                keyword_difficulty = 50.0
                competition = 0.5
                confidence = 0.3  # Low confidence

            # Apply adjustments based on keyword characteristics
            word_count = len(keyword.split())

            if word_count > 3:  # Long-tail keyword
                search_volume = int(search_volume * 0.8)  # Typically lower volume
                competition = float(competition * 0.7)  # Typically lower competition

            # Question-based keywords often have different metrics
            if any(
                q in keyword.lower()
                for q in ["how", "what", "why", "when", "where", "which"]
            ):
                search_volume = int(search_volume * 0.9)  # Often lower volume
                cpc = float(cpc * 0.9)  # Often lower CPC

            # Brand keywords (containing "nike") have different characteristics
            if "nike" in keyword.lower():
                search_volume = int(
                    search_volume * 1.2
                )  # Higher volume for brand terms
                competition = float(
                    competition * 1.1
                )  # Higher competition for brand terms

            return {
                "search_volume": int(
                    max(0, search_volume)
                ),  # Ensure non-negative integer
                "cpc": float(max(0, cpc)),  # Ensure non-negative float
                "keyword_difficulty": float(
                    max(0, min(100, keyword_difficulty))
                ),  # 0-100 range
                "competition_percentage": float(
                    max(0, min(1, competition))
                ),  # Changed from "competition" to "competition_percentage", 0-1 range
                "confidence_score": float(
                    confidence
                ),  # Changed from "confidence" to "confidence_score", Confidence in the estimate
            }

        except Exception as e:
            logger.error(f"Error in _estimate_metrics for '{keyword}': {str(e)}")
            return {
                "search_volume": 0,
                "cpc": 0.0,
                "keyword_difficulty": 0.0,
                "competition_percentage": 0.0,  # Changed from "competition" to "competition_percentage"
                "confidence_score": 0.0,  # Changed from "confidence" to "confidence_score"
            }

    async def _enrich_keywords(
        self,
        keywords: List[str],
        source: str = "generated",
        image_url: Optional[str] = None,
    ) -> List[KeywordVariant]:
        """Enrich keywords with metrics from similar keywords"""
        enriched_keywords = []

        for keyword in keywords:
            # Find similar keywords in database
            similar_keywords = self._find_similar_keywords(keyword)

            # Estimate metrics based on similar keywords
            metrics = self._estimate_metrics(keyword, similar_keywords)

            # Create KeywordVariant object
            variant = KeywordVariant(
                keyword=keyword,
                source=source,
                search_volume=metrics["search_volume"],
                cpc=metrics["cpc"],
                keyword_difficulty=metrics["keyword_difficulty"],
                competition_percentage=metrics["competition_percentage"],
                similar_keywords=similar_keywords,
                confidence_score=metrics["confidence_score"],
                image_url=image_url,  # Pass the image URL to the variant
            )

            enriched_keywords.append(variant)

        return enriched_keywords

    async def _calculate_composite_metrics(
        self, keywords: List[KeywordVariant]
    ) -> List[KeywordVariant]:
        """Calculate composite success metrics"""
        try:
            if not keywords:
                return []

            # Find max values for normalization
            max_volume = max(kw.search_volume for kw in keywords) or 1
            max_cpc = max(kw.cpc for kw in keywords) or 1

            for keyword in keywords:
                # Normalize metrics to 0-1 scale for calculation
                volume_score = min(1.0, keyword.search_volume / max_volume)
                cpc_score = min(1.0, keyword.cpc / max_cpc)
                difficulty_inverse = 1 - (
                    keyword.keyword_difficulty / 100
                )  # Lower difficulty is better
                competition_inverse = (
                    1 - keyword.competition_percentage
                )  # Lower competition is better

                # Calculate efficiency index (custom formula)
                # Higher volume, lower difficulty, and lower competition is better
                # CPC impact depends on campaign goals (higher CPC might mean higher value)

                # Volume has highest weight as it directly impacts potential traffic
                volume_weight = 0.4

                # Difficulty and competition affect ranking feasibility
                difficulty_weight = 0.25
                competition_weight = 0.25

                # CPC indicates commercial value but also cost
                cpc_weight = 0.1

                # Calculate weighted score
                keyword.efficiency_index = (
                    (volume_score * volume_weight)
                    + (difficulty_inverse * difficulty_weight)
                    + (competition_inverse * competition_weight)
                    + (cpc_score * cpc_weight)
                )

                # Adjust by confidence score - lower confidence means more uncertainty
                # We reduce the efficiency score slightly for low confidence estimates
                confidence_factor = 0.5 + (0.5 * keyword.confidence_score)
                keyword.efficiency_index = keyword.efficiency_index * confidence_factor

                # Ensure the index is between 0 and 1
                keyword.efficiency_index = max(0.0, min(1.0, keyword.efficiency_index))

            logger.info(f"Calculated composite metrics for {len(keywords)} keywords")
            return keywords

        except Exception as e:
            logger.error(f"Error in _calculate_composite_metrics: {str(e)}")
            return keywords  # Return original keywords if calculation fails

    async def _generate_explanations(
        self, keywords: List[KeywordVariant], ad_features: AdFeatures
    ) -> List[KeywordVariant]:
        """Generate explanations for each keyword variant"""
        try:
            if not keywords:
                return []

            # Process in smaller batches for better performance
            batch_size = 5
            batches = [
                keywords[i : i + batch_size]
                for i in range(0, len(keywords), batch_size)
            ]

            all_processed = []
            for batch in batches:
                # Process each batch with a timeout
                processed_batch = await self._process_explanation_batch(
                    batch, ad_features
                )
                all_processed.extend(processed_batch)

            return all_processed

        except Exception as e:
            logger.error(f"Error in _generate_explanations: {str(e)}")
            return keywords  # Return original keywords if explanation generation fails

    async def _process_explanation_batch(
        self, keyword_batch: List[KeywordVariant], ad_features: AdFeatures
    ) -> List[KeywordVariant]:
        """Process a batch of keywords to generate explanations with timeout"""
        for keyword in keyword_batch:
            try:
                # Skip if keyword already has an explanation
                if keyword.explanation and len(keyword.explanation) > 20:
                    continue

                # Get similar keywords data for context
                similar_keywords = self._find_similar_keywords(keyword.keyword, top_n=3)
                similar_keywords_context = ""
                if similar_keywords:
                    similar_keywords_context = "Similar Keywords Analysis:\n"
                    for sk in similar_keywords:
                        metrics = sk.get("metrics", {})
                        similar_keywords_context += f"- {sk.get('keyword', '')}: volume={metrics.get('search_volume', 0)}, cpc=${metrics.get('cpc', 0.0)}, difficulty={metrics.get('keyword_difficulty', 0.0)}\n"

                # Construct prompt
                prompt = f"""
                Analyze this keyword for a Nike ad and explain its potential value:
                
                Keyword: {keyword.keyword}
                
                Ad Information:
                - Visual Elements: {', '.join(ad_features.visual_cues)}
                - Target Audience: {json.dumps(ad_features.target_audience, indent=2)}
                - Visitor Intent: {ad_features.visitor_intent}
                
                Keyword Metrics:
                - Search Volume: {keyword.search_volume}
                - CPC: ${keyword.cpc}
                - Keyword Difficulty: {keyword.keyword_difficulty}
                - Competition: {keyword.competition_percentage}%
                - Efficiency Index: {keyword.efficiency_index}
                
                {similar_keywords_context if similar_keywords_context else "No similar keywords found in database."}
                
                Provide a concise 3-4 sentence explanation that MUST include:
                1. Why this keyword matches the ad's intent and audience
                2. The user intent it targets
                3. Its potential effectiveness
                4. Any optimization tips for using this keyword
                
                IMPORTANT: You must explicitly explain WHY the search volume, CPC, difficulty, and competition metrics were estimated as they were.
                
                Keep your explanation under 120 words and focus on actionable insights.
                """

                response = self.llm.complete(
                    prompt,
                    temperature=0.3,
                    timeout=10,  # Add timeout for faster processing
                )
                keyword.explanation = response.text.strip()

            except Exception as e:
                logger.warning(
                    f"Error generating explanation for keyword '{keyword.keyword}': {str(e)}"
                )
                # Set a default explanation if generation fails
                keyword.explanation = f"This keyword was selected for its relevance to {ad_features.visitor_intent}."

        return keyword_batch

    async def _rank_and_prioritize(
        self, keywords: List[KeywordVariant]
    ) -> List[KeywordVariant]:
        """Rank and prioritize keywords based on multiple factors"""
        try:
            if not keywords:
                return []

            # Create a copy of the keywords list to avoid modifying the original
            ranked_keywords = keywords.copy()

            # Primary sorting by efficiency index (descending)
            ranked_keywords.sort(key=lambda k: k.efficiency_index, reverse=True)

            # Segment keywords by type for diversity in results
            short_tail = []  # 1-2 words
            medium_tail = []  # 3-4 words
            long_tail = []  # 5+ words
            question_based = []  # Contains question words

            for kw in ranked_keywords:
                word_count = len(kw.keyword.split())

                # Check if it's a question-based keyword
                if any(
                    q in kw.keyword.lower()
                    for q in ["how", "what", "why", "when", "where", "which"]
                ):
                    question_based.append(kw)
                # Categorize by length
                elif word_count <= 2:
                    short_tail.append(kw)
                elif word_count <= 4:
                    medium_tail.append(kw)
                else:
                    long_tail.append(kw)

            # Sort each segment by efficiency index
            for segment in [short_tail, medium_tail, long_tail, question_based]:
                segment.sort(key=lambda k: k.efficiency_index, reverse=True)

            # Take top keywords from each segment to ensure diversity
            # Distribution: 3 short-tail, 5 medium-tail, 2 long-tail, 2 question-based
            max_short = 3
            max_medium = 5
            max_long = 2
            max_questions = 2

            # Ensure we have exactly 12 keywords total
            total_needed = 12

            top_short = short_tail[:max_short] if short_tail else []
            top_medium = medium_tail[:max_medium] if medium_tail else []
            top_long = long_tail[:max_long] if long_tail else []
            top_questions = question_based[:max_questions] if question_based else []

            # Count how many keywords we have so far
            current_count = (
                len(top_short) + len(top_medium) + len(top_long) + len(top_questions)
            )

            # If we don't have enough keywords, fill from the best available segments
            if current_count < total_needed:
                # Combine all remaining keywords
                remaining = []

                if len(short_tail) > max_short:
                    remaining.extend(short_tail[max_short:])
                if len(medium_tail) > max_medium:
                    remaining.extend(medium_tail[max_medium:])
                if len(long_tail) > max_long:
                    remaining.extend(long_tail[max_long:])
                if len(question_based) > max_questions:
                    remaining.extend(question_based[max_questions:])

                # Sort remaining by efficiency index
                remaining.sort(key=lambda k: k.efficiency_index, reverse=True)

                # Add keywords until we reach the desired total
                additional_needed = total_needed - current_count
                additional_keywords = remaining[:additional_needed]

                # Combine all keywords
                diverse_top = (
                    top_short
                    + top_medium
                    + top_long
                    + top_questions
                    + additional_keywords
                )
            else:
                # If we have more than enough, just take the top from each segment
                diverse_top = top_short + top_medium + top_long + top_questions

            # Sort the combined keywords by efficiency index
            diverse_top.sort(key=lambda k: k.efficiency_index, reverse=True)

            # Ensure we return exactly 12 keywords (or all if less than 12)
            final_ranked = diverse_top[: min(total_needed, len(diverse_top))]

            logger.info(
                f"Ranked and prioritized keywords: returning {len(final_ranked)} keywords"
            )
            return final_ranked

        except Exception as e:
            logger.error(f"Error in _rank_and_prioritize: {str(e)}")
            # Return at most 12 original keywords if ranking fails
            return keywords[: min(12, len(keywords))]

    async def save_keywords_to_database(
        self, keywords: List[KeywordVariant], ad_features: AdFeatures
    ) -> bool:
        """Save generated keywords to the database with proper error handling"""
        try:
            # Get user ID from ad features or use a default
            user_id = getattr(ad_features, "user_id", None)
            if not user_id:
                logger.warning("No user_id provided in ad_features")
                return False

            # Prepare records for insertion
            variant_records = []
            for keyword in keywords:
                variant_id = str(uuid.uuid4())
                record = {
                    "id": variant_id,  # Primary key
                    "user_id": user_id,
                    "keyword": keyword.keyword,
                    "source": keyword.source,
                    "search_volume": keyword.search_volume,
                    "cpc": keyword.cpc,
                    "keyword_difficulty": keyword.keyword_difficulty,
                    "competition_percentage": keyword.competition_percentage,
                    "efficiency_index": keyword.efficiency_index,
                    "confidence_score": keyword.confidence_score,
                    "explanation": keyword.explanation,
                    "image_url": ad_features.image_url,
                    "created_at": datetime.datetime.now().isoformat(),
                    "meta": json.dumps(
                        {  # Convert dict to JSON string
                            "visual_cues": ad_features.visual_cues,
                            "pain_points": ad_features.pain_points,
                            "visitor_intent": ad_features.visitor_intent,
                            "target_audience": ad_features.target_audience,
                            "product_category": ad_features.product_category,
                            "campaign_objective": ad_features.campaign_objective,
                        }
                    ),
                }
                variant_records.append(record)

            # Insert records in batches
            for i in range(0, len(variant_records), self.batch_size):
                batch = variant_records[i : i + self.batch_size]
                try:
                    # Use explicit column selection to avoid parsing errors
                    result = (
                        self.supabase.table("keyword_variants")
                        .insert(batch)
                        .select("id, keyword")  # Specify columns to return
                        .execute()
                    )

                    if not result.data:
                        logger.warning(
                            f"No data returned for batch {i//self.batch_size + 1}"
                        )
                    else:
                        logger.info(
                            f"Successfully inserted batch {i//self.batch_size + 1} with {len(result.data)} records"
                        )
                except Exception as e:
                    logger.error(
                        f"Error inserting batch {i//self.batch_size + 1}: {str(e)}"
                    )
                    continue

            return True

        except Exception as e:
            logger.error(f"Error in save_keywords_to_database: {str(e)}")
            return False

    async def export_to_json(
        self,
        keywords: List[KeywordVariant],
        ad_features: AdFeatures,
        output_path: Optional[str] = None,
    ) -> Optional[str]:
        """Export generated keyword variants to a JSON file, organized by image URL"""
        try:
            # Filter to only include generated keywords
            generated_keywords = [kw for kw in keywords if kw.source == "generated"]

            if not generated_keywords:
                logger.warning("No generated keywords to export to JSON")
                return None

            # Create output directory if it doesn't exist
            if not output_path:
                output_dir = Path("exports")
                output_dir.mkdir(exist_ok=True)
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                output_path = str(output_dir / f"keyword_variants_{timestamp}.json")
            else:
                path_obj = Path(output_path)
                path_obj.parent.mkdir(exist_ok=True, parents=True)
                output_path = str(path_obj)

            # Get absolute path for more informative logging
            abs_path = str(Path(output_path).absolute())

            # Organize keywords by image URL
            keywords_by_image: Dict[str, List[Dict[str, Any]]] = {}
            for kw in generated_keywords:
                # Find the image URL for this keyword by examining its AdFeatures
                # Get any image_url property from the keyword object if it exists
                if hasattr(kw, "image_url") and kw.image_url:
                    image_url = kw.image_url
                else:
                    # Default to "Not specified" if no image URL is found
                    image_url = "Not specified"

                # Initialize the image URL entry if it doesn't exist
                if image_url not in keywords_by_image:
                    keywords_by_image[image_url] = []

                # Add the keyword data
                keyword_data = {
                    "keyword": kw.keyword,
                    "metrics": {
                        "search_volume": kw.search_volume,
                        "cpc": kw.cpc,
                        "keyword_difficulty": kw.keyword_difficulty,
                        "competition_percentage": kw.competition_percentage,
                        "efficiency_index": kw.efficiency_index,
                        "confidence_score": kw.confidence_score,
                    },
                    "similar_keywords": [
                        {
                            "keyword": sk.get("keyword", ""),
                            "volume": sk.get("metrics", {}).get("search_volume", 0),
                        }
                        for sk in kw.similar_keywords
                    ],
                    "explanation": kw.explanation,
                }
                keywords_by_image[image_url].append(keyword_data)

            # Prepare data for export with proper typing
            export_data: Dict[str, Any] = {
                "export_timestamp": datetime.datetime.now().isoformat(),
                "total_keywords": len(generated_keywords),
                "unique_images": len(keywords_by_image),
                "images": [],
                "metrics_explanation": {
                    "search_volume": "Monthly search volume for the keyword",
                    "cpc": "Average cost per click in USD",
                    "keyword_difficulty": "SEO difficulty score (0-100)",
                    "competition_percentage": "Percentage of competing ads (0-100)",
                    "efficiency_index": "Composite score of volume vs. difficulty (higher is better)",
                    "confidence_score": "Confidence in the metric estimates (0-1)",
                },
            }

            # Add data for each image URL
            for image_url, keyword_list in keywords_by_image.items():
                image_data = {
                    "image_url": image_url,
                    "total_keywords": len(keyword_list),
                    "keywords": keyword_list,
                }
                export_data["images"].append(image_data)

            # Write to JSON file
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)

            # Log the number of keywords for each image URL
            image_counts = ", ".join(
                [f"{url}: {len(kws)}" for url, kws in keywords_by_image.items()]
            )
            logger.info(
                f"Successfully exported {len(generated_keywords)} keywords across {len(keywords_by_image)} image URLs ({image_counts}) to JSON file at:\n{abs_path}"
            )

            return output_path

        except Exception as e:
            logger.error(f"Error exporting keywords to JSON: {str(e)}")
            return None

    async def export_to_csv(
        self,
        keywords: List[KeywordVariant],
        ad_features: AdFeatures,
        output_path: Optional[str] = None,
    ) -> Optional[str]:
        """Export generated keyword variants to a CSV file, organized by image URL"""
        try:
            # Filter to only include generated keywords
            generated_keywords = [kw for kw in keywords if kw.source == "generated"]

            if not generated_keywords:
                logger.warning("No generated keywords to export to CSV")
                return None

            # Create output directory if it doesn't exist
            if not output_path:
                output_dir = Path("exports")
                output_dir.mkdir(exist_ok=True)
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                output_path = str(output_dir / f"keyword_variants_{timestamp}.csv")
            else:
                path_obj = Path(output_path)
                path_obj.parent.mkdir(exist_ok=True, parents=True)
                output_path = str(path_obj)

            # Get absolute path for more informative logging
            abs_path = str(Path(output_path).absolute())

            # Define CSV headers with clear descriptions
            headers = [
                "Image URL",
                "Generated Keyword",
                "Estimated Search Volume (monthly)",
                "Estimated CPC ($)",
                "Estimated Keyword Difficulty (0-100)",
                "Estimated Competition (%)",
                "Efficiency Index (higher is better)",
                "Confidence Score (0-1)",
                "Similar Keywords (with volume)",
                "Explanation (including metric estimation reasoning)",
            ]

            # Organize keywords by image URL for counting
            keywords_by_image: Dict[str, List[KeywordVariant]] = {}
            for kw in generated_keywords:
                image_url = kw.image_url if kw.image_url else "Not specified"
                if image_url not in keywords_by_image:
                    keywords_by_image[image_url] = []
                keywords_by_image[image_url].append(kw)

            # Write to CSV file
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(headers)

                # Sort keywords by efficiency index for better readability
                sorted_keywords = sorted(
                    generated_keywords, key=lambda k: k.efficiency_index, reverse=True
                )

                for kw in sorted_keywords:
                    # Get image URL from the keyword itself
                    image_url = kw.image_url if kw.image_url else "Not specified"

                    # Format similar keywords as a semicolon-separated list
                    similar_kws = "; ".join(
                        [
                            f"{sk.get('keyword', '')} (volume: {sk.get('metrics', {}).get('search_volume', 0)})"
                            for sk in kw.similar_keywords
                        ]
                    )

                    writer.writerow(
                        [
                            image_url,
                            kw.keyword,
                            kw.search_volume,
                            f"{kw.cpc:.2f}",
                            f"{kw.keyword_difficulty:.1f}",
                            f"{kw.competition_percentage:.1f}",
                            f"{kw.efficiency_index:.2f}",
                            f"{kw.confidence_score:.2f}",
                            similar_kws,
                            kw.explanation,
                        ]
                    )

            # Log the number of keywords for each image URL
            image_counts = ", ".join(
                [f"{url}: {len(kws)}" for url, kws in keywords_by_image.items()]
            )
            logger.info(
                f"Successfully exported {len(generated_keywords)} keywords across {len(keywords_by_image)} image URLs ({image_counts}) to CSV file at:\n{abs_path}"
            )
            return output_path

        except Exception as e:
            logger.error(f"Error exporting keywords to CSV: {str(e)}")
            return None

    async def get_all_keywords(self, user_id: str) -> List[Dict]:
        """Get all unique keywords with variant counts for a user"""
        try:
            # Use the same validation logic as in save_to_database
            test_user_id = "97d82337-5d25-4258-b47f-5be8ea53114c"

            # Check if user_id is a valid UUID format
            uuid_pattern = re.compile(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                re.IGNORECASE,
            )

            # Use the provided user_id if it's a valid UUID, otherwise use the test user ID
            if user_id and uuid_pattern.match(user_id):
                logger.info(
                    f"Using provided user_id: {user_id} for retrieving all keywords"
                )
                db_user_id = user_id
            else:
                logger.warning(
                    f"Invalid UUID format for user_id: {user_id}. Using test user ID instead."
                )
                db_user_id = test_user_id

            # Query all variants for this user
            result = (
                self.supabase.table("keyword_variants")
                .select("keyword, count(*)")
                .eq("user_id", db_user_id)
                .group_by("keyword")
                .execute()
            )

            # Process results into the expected format
            keywords = []
            for item in result.data:
                keywords.append(
                    {
                        "keyword": item.get("keyword"),
                        "variant_count": item.get("count", 0),
                    }
                )

            logger.info(f"Retrieved {len(keywords)} keywords for test user")
            return keywords

        except Exception as e:
            logger.error(f"Error in get_all_keywords: {str(e)}")
            return []

    async def get_variants_for_keyword(self, keyword: str, user_id: str) -> List[Dict]:
        """Get all variants for a specific keyword"""
        try:
            # Use the same validation logic as in save_to_database
            test_user_id = "97d82337-5d25-4258-b47f-5be8ea53114c"

            # Check if user_id is a valid UUID format
            uuid_pattern = re.compile(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                re.IGNORECASE,
            )

            # Use the provided user_id if it's a valid UUID, otherwise use the test user ID
            if user_id and uuid_pattern.match(user_id):
                logger.info(
                    f"Using provided user_id: {user_id} for retrieving variants of keyword '{keyword}'"
                )
                db_user_id = user_id
            else:
                logger.warning(
                    f"Invalid UUID format for user_id: {user_id}. Using test user ID instead."
                )
                db_user_id = test_user_id

            # Query variants for this keyword and user
            result = (
                self.supabase.table("keyword_variants")
                .select("*")
                .eq("user_id", db_user_id)
                .eq("keyword", keyword)
                .execute()
            )

            variants = result.data
            logger.info(
                f"Retrieved {len(variants)} variants for keyword '{keyword}' for test user"
            )
            return variants

        except Exception as e:
            logger.error(f"Error in get_variants_for_keyword: {str(e)}")
            return []


if __name__ == "__main__":

    async def main():
        # Test code for when the module is run directly
        logging.basicConfig(level=logging.INFO)
        generator = KeywordVariantGenerator()
        test_features = AdFeatures(
            visual_cues=["Running", "Athletic"],
            pain_points=["Discomfort", "Performance"],
            visitor_intent="Purchase athletic shoes",
            target_audience={"age": "25-34", "interests": ["Running", "Fitness"]},
            product_category="Athletic Footwear",
        )
        results = await generator.generate_keyword_variants(test_features)
        print(f"Generated {len(results)} keyword variants")
        for kw in results:
            print(f"- {kw.keyword} (Score: {kw.efficiency_index:.2f})")

    # Run the async main function
    import asyncio

    asyncio.run(main())
