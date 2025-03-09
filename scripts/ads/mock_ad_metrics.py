import asyncio
import json
import time
import random
from datetime import datetime, timedelta
from tqdm import tqdm
from typing import List, Dict, Any, Optional
from uuid import UUID
import os
from pydantic import BaseModel, Field, UUID4
from enum import Enum

# Import existing models and helpers
from models import AdAnalysis
from helpers import get_supabase_client, get_ad_analyses_from_db


# Define new models for enhanced metrics
class Demographics(BaseModel):
    age_groups: Dict[str, float]  # Percentage distribution by age group
    gender: Dict[str, float]  # Percentage distribution by gender
    locations: Dict[str, float]  # Top locations by percentage
    interests: List[str]  # Interest categories


class DeviceMetrics(BaseModel):
    desktop: float  # Percentage of traffic from desktop
    mobile: float  # Percentage of traffic from mobile
    tablet: float  # Percentage of traffic from tablet


class EngagementMetrics(BaseModel):
    avg_view_time: float  # Average view time in seconds
    video_completion_rate: Optional[float] = None  # For video ads
    interaction_rate: float  # Percentage of impressions with interactions
    interaction_types: Dict[str, int]  # Count by interaction type


class AdPlacement(BaseModel):
    website_categories: Dict[str, float]  # Distribution by website category
    specific_placements: List[str]  # List of top placements
    above_fold_percentage: float  # Percentage of impressions above the fold


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


class AgeGroup(str, Enum):
    AGE_16_18 = "16-18"
    AGE_18_24 = "18-24"
    AGE_25_34 = "25-34"
    AGE_35_44 = "35-44"
    AGE_45_54 = "45-54"
    AGE_55_PLUS = "55+"


class PrimaryIntent(str, Enum):
    PRODUCT_DISCOVERY = "product_discovery"
    BRAND_AWARENESS = "brand_awareness"
    PRODUCT_CONSIDERATION = "product_consideration"
    PURCHASE_INTENT = "purchase_intent"
    NEW_RELEASE = "new_release"
    SPECIAL_PROMOTION = "special_promotion"
    STORE_VISIT = "store_visit"
    APP_INSTALL = "app_install"
    PRODUCT_EDUCATION = "product_education"
    COLLECTION_SHOWCASE = "collection_showcase"


class WebsiteCategory(str, Enum):
    SPORTS_NEWS = "Sports News & Media"
    FITNESS = "Fitness & Training"
    FASHION = "Fashion & Lifestyle"
    ENTERTAINMENT = "Entertainment"
    SOCIAL_MEDIA = "Social Media"
    ECOMMERCE = "E-commerce"
    SPORTS_STREAMING = "Sports Streaming"
    HEALTH = "Health & Wellness"
    TECHNOLOGY = "Technology"
    GAMING = "Gaming"
    MUSIC = "Music"
    YOUTH_CULTURE = "Youth Culture"
    OUTDOOR = "Outdoor Activities"


class Channel(str, Enum):
    GOOGLE_DISPLAY = "Google Display"
    GOOGLE_SEARCH = "Google Search"
    YOUTUBE = "YouTube"
    FACEBOOK = "Facebook"
    INSTAGRAM = "Instagram"
    META_AUDIENCE = "Meta Audience Network"
    TIKTOK = "TikTok"


class EnhancedAdMetric(BaseModel):
    """Enhanced ad metric model with detailed performance data

    All numeric metrics should be non-negative.
    Rate fields (ctr, conversion_rate, viewability_rate) should be between 0.0 and 1.0.
    Quality score should be between 0.0 and 10.0.
    """

    ad_id: UUID4
    campaign_id: str = ""
    channel: Channel

    # Basic metrics
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0.0

    # Conversion metrics
    conversions: int = 0
    conversion_rate: float = 0.0

    # Cost metrics
    cost: float = 0.0  # Total cost in currency
    cpc: float = 0.0  # Cost per click
    cpm: float = 0.0  # Cost per thousand impressions

    # Performance metrics
    roas: float = 0.0  # Return on ad spend
    viewable_impressions: int = 0
    viewability_rate: float = 0.0

    # Enriched data
    demographics: Optional[Demographics] = None
    device_metrics: Optional[DeviceMetrics] = None
    engagement: Optional[EngagementMetrics] = None
    placement: Optional[AdPlacement] = None

    # Time data
    date: str  # ISO format date (YYYY-MM-DD)

    # Simulation metadata
    quality_score: float = 0.0


class DemographicTargets(BaseModel):
    """Structured demographic targeting information.

    age_groups and genders should contain at least one item.
    """

    age_groups: List[AgeGroup]
    genders: List[Gender]
    locations: Optional[List[str]] = None


class ChannelRecommendation(BaseModel):
    """Individual channel recommendation with relevance score.

    relevance_score should be between 0-1.
    """

    channel: Channel
    relevance_score: float


class ChannelRecommendations(BaseModel):
    """Set of channel recommendations.

    recommendations should contain at least one item.
    """

    recommendations: List[ChannelRecommendation]


class EngagementPrediction(BaseModel):
    """Predicted engagement metrics.

    Rate fields should be between 0.0 and 1.0.
    Time durations should be positive values in seconds.
    """

    avg_view_time: Optional[float] = None
    interaction_rate: Optional[float] = None
    video_completion_rate: Optional[float] = None
    bounce_rate: Optional[float] = None
    avg_session_duration: Optional[float] = None


class AdRecommendations(BaseModel):
    """Structure for ad metrics recommendations.

    quality_score: Should be between 0-10
    expected_*_modifier: Should be between 0.5-2.0
    suggested_placements: Should contain at least one item
    """

    quality_score: float
    channel_recommendations: ChannelRecommendations
    demographic_targets: DemographicTargets
    expected_ctr_modifier: float
    expected_conversion_rate_modifier: float
    expected_cost_modifier: float
    primary_intent: PrimaryIntent
    suggested_placements: List[WebsiteCategory]
    engagement_prediction: EngagementPrediction


class MarketResearchData(BaseModel):
    """Structure to store relevant market research data for ad simulation"""

    intent_summary: str
    target_audience: Dict[str, Any]
    pain_points: List[Dict[str, Any]]
    key_features: List[Dict[str, Any]]
    competitive_advantages: List[Dict[str, Any]]


# Constants for ad simulation
CHANNELS = [
    "Google Display",
    "YouTube",
    "Facebook",
    "Instagram",
    "Meta Audience Network",
    "TikTok",
    "Twitter",
    "Snapchat",
    "Pinterest",
    "Spotify",
    "ESPN",
]

# Channel-specific baseline metrics for Nike (adjusted for athletic footwear industry)
CHANNEL_BASELINES = {
    "Google Display": {"ctr": 0.0058, "cpc": 0.88, "conv_rate": 0.0129},
    "YouTube": {"ctr": 0.0092, "cpc": 1.12, "conv_rate": 0.0145},
    "Facebook": {"ctr": 0.0104, "cpc": 1.17, "conv_rate": 0.0118},
    "Instagram": {"ctr": 0.0132, "cpc": 1.46, "conv_rate": 0.0134},
    "Meta Audience Network": {"ctr": 0.0028, "cpc": 0.53, "conv_rate": 0.0102},
    "TikTok": {"ctr": 0.0159, "cpc": 1.32, "conv_rate": 0.0147},
    "Twitter": {"ctr": 0.0035, "cpc": 0.94, "conv_rate": 0.0089},
    "Snapchat": {"ctr": 0.0112, "cpc": 0.98, "conv_rate": 0.0124},
    "Pinterest": {"ctr": 0.0086, "cpc": 1.08, "conv_rate": 0.0156},
    "Spotify": {"ctr": 0.0047, "cpc": 0.79, "conv_rate": 0.0074},
    "ESPN": {"ctr": 0.0078, "cpc": 1.24, "conv_rate": 0.0126},
}

# Age group definitions - aligned with Nike's target demographics
AGE_GROUPS = ["16-18", "18-24", "25-34", "35-44", "45-54", "55+"]

# Interest categories relevant to Nike
INTEREST_CATEGORIES = [
    "Running",
    "Basketball",
    "Soccer/Football",
    "Fitness & Training",
    "Athleisure",
    "Streetwear & Urban Fashion",
    "Outdoor Activities",
    "Sports Enthusiasts",
    "Sneakerheads",
    "Athletic Performance",
    "Sustainability",
    "Lifestyle & Fashion",
    "Health & Wellness",
    "College/University Sports",
    "Professional Sports",
    "Olympic Sports",
    "Yoga & Mindfulness",
    "Dance & Movement",
    "Team Sports",
    "Extreme Sports",
]

# Website categories for placements - relevant to Nike's audience
WEBSITE_CATEGORIES = [
    "Sports News & Media",
    "Fitness & Training",
    "Fashion & Lifestyle",
    "Entertainment",
    "Social Media",
    "E-commerce",
    "Sports Streaming",
    "Health & Wellness",
    "Technology",
    "Gaming",
    "Music",
    "Youth Culture",
    "Outdoor Activities",
]

# Interaction types for Nike ads
INTERACTION_TYPES = [
    "Hover",
    "Video Play",
    "Expand",
    "Click Through",
    "Add to Cart",
    "Find Store",
    "Product Customize",
    "Size Guide",
    "Color Change",
    "Video Complete",
    "Share",
    "Save to Wishlist",
]

# Get the OpenAI API key from environment variables
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    from dotenv import load_dotenv

    load_dotenv(".env.local")
    openai_api_key = os.getenv("OPENAI_API_KEY")


def select_random_channels() -> List[ChannelRecommendation]:
    """Randomly select channels and assign relevance scores based on channel characteristics"""
    # Define channel pools with their base weights
    primary_channels = [
        (Channel.INSTAGRAM, 0.80, 0.98),  # Visual-heavy platform
        (Channel.TIKTOK, 0.75, 0.95),  # Youth engagement
        (Channel.YOUTUBE, 0.70, 0.92),  # Video content
    ]

    secondary_channels = [
        (Channel.FACEBOOK, 0.65, 0.85),  # Broad reach
        (Channel.GOOGLE_DISPLAY, 0.60, 0.82),  # Display ads
        (Channel.META_AUDIENCE, 0.55, 0.75),  # Extended reach
        (Channel.GOOGLE_SEARCH, 0.50, 0.70),  # Search intent
    ]

    # Always select 1-2 primary channels
    num_primary = random.randint(1, 2)
    selected_primary = random.sample(primary_channels, num_primary)

    # Select 1-3 secondary channels
    remaining_slots = random.randint(1, 3)
    selected_secondary = random.sample(secondary_channels, remaining_slots)

    # Combine and create recommendations
    all_selected = selected_primary + selected_secondary

    # Add some randomization to the relevance scores
    channel_recs = []
    for channel, min_score, max_score in all_selected:
        # Add more variance to the score
        base_score = random.uniform(min_score, max_score)
        variance = random.uniform(-0.1, 0.1)  # ±10% variance
        final_score = max(0.5, min(0.98, base_score + variance))
        channel_recs.append(
            ChannelRecommendation(channel=channel, relevance_score=final_score)
        )

    return channel_recs


async def get_gpt4_recommendations(
    ad_analysis: AdAnalysis,
    market_research: Optional[Dict] = None,
    pre_selected_channels: List[ChannelRecommendation] = None,
) -> AdRecommendations:
    """
    Get structured recommendations for Nike ad metrics simulation using OpenAI's structured output parsing
    """
    import openai

    # Initialize OpenAI client
    client = openai.OpenAI(api_key=openai_api_key)

    # Prepare the ad analysis for the prompt
    features_text = ""
    if ad_analysis.features:
        for feature in ad_analysis.features:
            features_text += f"- {feature.keyword} ({feature.category}, {feature.location}, confidence: {feature.confidence_score})\n"

    # Add channel context to the prompt
    channel_context = "No pre-selected channels."
    if pre_selected_channels:
        channel_context = "Pre-selected channels:\n"
        for rec in pre_selected_channels:
            channel_context += (
                f"- {rec.channel.value} (relevance: {rec.relevance_score:.2f})\n"
            )

    # Prepare market research context if available
    market_context = "No market research data available."
    if market_research:
        market_context = f"""
        Intent Summary: {market_research.get("intent_summary", "N/A")}
        Target Audience: {json.dumps(market_research.get("target_audience", {}), indent=2)}
        Pain Points: {json.dumps(market_research.get("pain_points", []), indent=2)}
        Key Features: {json.dumps(market_research.get("key_features", []), indent=2)}
        Competitive Advantages: {json.dumps(market_research.get("competitive_advantages", []), indent=2)}
        """

    try:
        # Use OpenAI's structured output parsing
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """You are an advertising metrics simulation expert specializing in athletic footwear and apparel brands like Nike. 
                    Analyze the ad and channel selection to provide engagement and demographic predictions that match the selected channels.
                    
                    The response should include appropriate metrics for the pre-selected channels, focusing on:
                    - demographic_targets: Appropriate for both the ad content and selected channels
                    - expected_ctr_modifier: Adjusted for the channel mix
                    - expected_conversion_rate_modifier: Adjusted for the channel mix
                    - expected_cost_modifier: Based on channel competition
                    - primary_intent: Matching the strongest channel
                    - suggested_placements: Aligned with selected channels
                    - engagement_prediction: Appropriate for the channel mix""",
                },
                {
                    "role": "user",
                    "content": f"""
                    Analyze this Nike shoe advertisement and provide recommendations.
                    
                    Ad Description: {ad_analysis.image_description}
                    
                    Ad Features:
                    {features_text}
                    
                    Channel Selection:
                    {channel_context}
                    
                    Market Research Context:
                    {market_context}
                    """,
                },
            ],
            response_format=AdRecommendations,
            temperature=0.2,
            max_tokens=1500,
        )

        result = completion.choices[0].message.parsed
        # Override the channel recommendations with our pre-selected ones
        if pre_selected_channels:
            result.channel_recommendations = ChannelRecommendations(
                recommendations=pre_selected_channels
            )
        return result

    except Exception as e:
        print(f"Error calling GPT-4o-mini API: {e}")

        # Use pre-selected channels if available, otherwise generate new ones
        channel_recs = pre_selected_channels or select_random_channels()

        # Determine primary age group based on dominant channel
        primary_channel = max(channel_recs, key=lambda x: x.relevance_score).channel
        if primary_channel in [Channel.TIKTOK, Channel.INSTAGRAM]:
            primary_age = AgeGroup.AGE_18_24
        elif primary_channel in [Channel.YOUTUBE, Channel.FACEBOOK]:
            primary_age = AgeGroup.AGE_25_34
        else:
            primary_age = random.choice([AgeGroup.AGE_18_24, AgeGroup.AGE_25_34])

        # Rest of the fallback logic...
        age_groups = [primary_age]
        adjacent_ages = {
            AgeGroup.AGE_16_18: [AgeGroup.AGE_18_24],
            AgeGroup.AGE_18_24: [AgeGroup.AGE_16_18, AgeGroup.AGE_25_34],
            AgeGroup.AGE_25_34: [AgeGroup.AGE_18_24, AgeGroup.AGE_35_44],
            AgeGroup.AGE_35_44: [AgeGroup.AGE_25_34, AgeGroup.AGE_45_54],
        }
        if primary_age in adjacent_ages:
            num_adjacent = random.randint(1, min(2, len(adjacent_ages[primary_age])))
            age_groups.extend(random.sample(adjacent_ages[primary_age], num_adjacent))

        # Adjust engagement predictions based on dominant channel
        if primary_channel in [Channel.YOUTUBE, Channel.TIKTOK]:
            video_completion_rate = random.uniform(0.30, 0.75)
            avg_view_time = random.uniform(3.5, 6.0)
        elif primary_channel in [Channel.INSTAGRAM, Channel.FACEBOOK]:
            video_completion_rate = random.uniform(0.20, 0.60)
            avg_view_time = random.uniform(2.5, 4.5)
        else:
            video_completion_rate = None
            avg_view_time = random.uniform(2.0, 3.5)

        engagement_pred = EngagementPrediction(
            avg_view_time=avg_view_time,
            interaction_rate=random.uniform(0.05, 0.12),
            video_completion_rate=video_completion_rate,
        )

        return AdRecommendations(
            quality_score=random.uniform(7.0, 9.2),
            channel_recommendations=ChannelRecommendations(
                recommendations=channel_recs
            ),
            demographic_targets=DemographicTargets(
                age_groups=age_groups,
                genders=[Gender.MALE, Gender.FEMALE],
            ),
            expected_ctr_modifier=random.uniform(0.8, 1.4),
            expected_conversion_rate_modifier=random.uniform(0.8, 1.4),
            expected_cost_modifier=random.uniform(0.9, 1.3),
            primary_intent=random.choice(list(PrimaryIntent)),
            suggested_placements=random.sample(
                [
                    WebsiteCategory.SPORTS_NEWS,
                    WebsiteCategory.FITNESS,
                    WebsiteCategory.FASHION,
                    WebsiteCategory.SOCIAL_MEDIA,
                    WebsiteCategory.YOUTH_CULTURE,
                    WebsiteCategory.ENTERTAINMENT,
                    WebsiteCategory.ECOMMERCE,
                ],
                k=random.randint(2, 4),
            ),
            engagement_prediction=engagement_pred,
        )


async def fetch_market_research_data(supabase_client, ad_id: UUID) -> Optional[Dict]:
    """
    Fetch related market research data for Nike ads using the join_market_research_and_library_items RPC
    """
    try:
        # Call the RPC function
        result = supabase_client.rpc("join_market_research_and_library_items").execute()

        # Filter for relevant market research data
        all_data = result.data

        # This is simplified - in a real implementation, you would need to
        # identify which market research items are relevant to this specific Nike ad
        # For now, we'll just use the first market research item if available
        market_research_items = [
            item for item in all_data if item.get("item_type") == "market_research"
        ]

        if market_research_items:
            # Get the first item
            research_item = market_research_items[0]
            return {
                "intent_summary": research_item.get("intent_summary", ""),
                "target_audience": research_item.get("target_audience", {}),
                "pain_points": research_item.get("pain_points", []),
                "key_features": research_item.get("key_features", []),
                "competitive_advantages": research_item.get(
                    "competitive_advantages", []
                ),
            }
        return None

    except Exception as e:
        print(f"Error fetching market research data: {e}")
        return None


def generate_demographics(recommendations: AdRecommendations) -> Demographics:
    """Generate demographic metrics based on recommendations"""
    # Get recommended age groups and convert to distribution
    age_weights = {
        AgeGroup.AGE_16_18: 0.20,  # Higher weight for younger demographics
        AgeGroup.AGE_18_24: 0.25,
        AgeGroup.AGE_25_34: 0.25,
        AgeGroup.AGE_35_44: 0.15,
        AgeGroup.AGE_45_54: 0.10,
        AgeGroup.AGE_55_PLUS: 0.05,
    }

    # Filter and normalize weights based on recommended age groups
    recommended_ages = {
        age: weight
        for age, weight in age_weights.items()
        if age in recommendations.demographic_targets.age_groups
    }
    total_weight = sum(recommended_ages.values())
    age_distribution = {
        str(age.value): weight / total_weight
        for age, weight in recommended_ages.items()
    }

    # Generate gender distribution based on recommendations
    gender_weights = {Gender.MALE: 0.45, Gender.FEMALE: 0.45, Gender.UNKNOWN: 0.10}
    recommended_genders = {
        gender: weight
        for gender, weight in gender_weights.items()
        if gender in recommendations.demographic_targets.genders
    }
    total_gender_weight = sum(recommended_genders.values())
    gender_distribution = {
        str(gender.value): weight / total_gender_weight
        for gender, weight in recommended_genders.items()
    }

    # Generate location distribution (US-centric for Nike)
    locations = {
        "United States": 0.60,
        "China": 0.15,
        "United Kingdom": 0.08,
        "Japan": 0.07,
        "Germany": 0.05,
        "France": 0.05,
    }

    # Generate interests based on Nike's target audience
    interests = [
        "Athletic Footwear",
        "Sports & Fitness",
        "Running",
        "Basketball",
        "Soccer/Football",
        "Training & Gym",
        "Streetwear",
        "Sneaker Culture",
        "Active Lifestyle",
        "Urban Fashion",
    ]

    return Demographics(
        age_groups=age_distribution,
        gender=gender_distribution,
        locations=locations,
        interests=random.sample(interests, k=min(5, len(interests))),
    )


def generate_device_metrics() -> DeviceMetrics:
    """
    Generate realistic device distribution for Nike's audience (skews mobile)
    """
    # Nike's audience skews more mobile than average
    desktop = random.uniform(0.22, 0.35)
    mobile = random.uniform(
        0.50, 0.70
    )  # Higher mobile usage for Nike's target demographic
    tablet = random.uniform(0.05, 0.15)

    # Normalize to ensure sum is 1.0
    total = desktop + mobile + tablet
    desktop /= total
    mobile /= total
    tablet /= total

    return DeviceMetrics(desktop=desktop, mobile=mobile, tablet=tablet)


def generate_engagement_metrics(
    recommendations: AdRecommendations,
) -> EngagementMetrics:
    """
    Generate realistic engagement metrics for Nike ads based on recommendations
    """
    # Get predicted engagement values or use defaults
    avg_view_time = (
        recommendations.engagement_prediction.avg_view_time
        if recommendations.engagement_prediction.avg_view_time is not None
        else random.uniform(2.5, 5.0)  # Nike ads typically have good engagement
    )

    interaction_rate = (
        recommendations.engagement_prediction.interaction_rate
        if recommendations.engagement_prediction.interaction_rate is not None
        else random.uniform(0.04, 0.09)  # Higher interaction for Nike's visual content
    )

    # For video ads, generate completion rate (Nike uses a lot of video content)
    video_completion_rate = None
    if random.random() < 0.65:  # 65% chance this is a video ad for Nike
        video_completion_rate = (
            recommendations.engagement_prediction.video_completion_rate
            if recommendations.engagement_prediction.video_completion_rate is not None
            else random.uniform(0.25, 0.70)  # Nike's storytelling drives completion
        )

    # Generate interaction types
    num_interaction_types = random.randint(3, 6)
    selected_types = random.sample(INTERACTION_TYPES, num_interaction_types)

    interaction_types = {}
    for interaction_type in selected_types:
        if interaction_type in ["Video Play", "Product Customize", "Color Change"]:
            # These are particularly relevant for Nike shoes
            interaction_types[interaction_type] = random.randint(20, 150)
        else:
            interaction_types[interaction_type] = random.randint(5, 100)

    return EngagementMetrics(
        avg_view_time=avg_view_time,
        video_completion_rate=video_completion_rate,
        interaction_rate=interaction_rate,
        interaction_types=interaction_types,
    )


def generate_ad_placement(recommendations: AdRecommendations) -> AdPlacement:
    """
    Generate realistic ad placement data for Nike shoe ads based on recommendations
    """
    # Website categories distribution
    recommended_categories = recommendations.suggested_placements
    website_categories = {}

    total = 0
    for category in WEBSITE_CATEGORIES:
        if category in recommended_categories:
            percentage = random.uniform(0.15, 0.30)  # 15-30% for recommended categories
        elif category in ["Sports News & Media", "Fitness & Training", "Youth Culture"]:
            # These categories are particularly relevant for Nike regardless
            percentage = random.uniform(0.08, 0.18)
        else:
            percentage = random.uniform(0.01, 0.06)  # 1-6% for other categories
        website_categories[category] = percentage
        total += percentage

    # Normalize to ensure sum is 1.0
    for category in website_categories:
        website_categories[category] /= total

    # Generate specific placement examples
    num_placements = random.randint(4, 9)
    placements = []

    # Real websites for each category relevant to Nike's target audience
    category_websites = {
        "Sports News & Media": [
            "espn.com/nba",
            "bleacherreport.com/basketball",
            "sports.yahoo.com/soccer",
            "nbcsports.com/olympics",
            "skysports.com/football",
            "theathletic.com/basketball",
        ],
        "Fitness & Training": [
            "menshealth.com/fitness",
            "womenshealthmag.com/fitness",
            "bodybuilding.com/workout",
            "runnersworld.com/training",
            "myfitnesspal.com/blog",
            "selfmagazine.com/fitness",
        ],
        "Fashion & Lifestyle": [
            "gq.com/style",
            "complex.com/style",
            "hypebeast.com/footwear",
            "highsnobiety.com/sneakers",
            "vogue.com/fashion",
            "elle.com/fashion/trend-reports",
        ],
        "Entertainment": [
            "rollingstone.com/music",
            "billboard.com/charts",
            "variety.com/culture",
            "mtv.com/news",
            "vulture.com/entertainment",
            "ew.com/movies",
        ],
        "Social Media": [
            "instagram.com/explore",
            "tiktok.com/discover",
            "twitter.com/explore",
            "pinterest.com/categories/mens-fashion",
            "snapchat.com/discover",
            "facebook.com/stories",
        ],
        "E-commerce": [
            "footlocker.com/category/shoes",
            "jdsports.com/men/mens-footwear",
            "finishline.com/new-arrivals",
            "eastbay.com/category/shoes/basketball",
            "asos.com/men/shoes",
            "zappos.com/athletic",
        ],
        "Sports Streaming": [
            "nba.com/games",
            "mlb.tv/games",
            "dazn.com/en-US/home",
            "peacocktv.com/sports",
            "espnplus.com/sports",
            "fubo.tv/sports",
        ],
        "Health & Wellness": [
            "shape.com/fitness",
            "mindbodygreen.com/fitness",
            "wellandgood.com/fitness",
            "health.com/fitness",
            "prevention.com/fitness",
            "webmd.com/fitness-exercise",
        ],
        "Technology": [
            "cnet.com/wearable-tech",
            "techcrunch.com/gadgets",
            "wired.com/category/gear",
            "theverge.com/tech",
            "engadget.com/wearables",
            "mashable.com/tech",
        ],
        "Gaming": [
            "ign.com/sports-games",
            "gamespot.com/games/sports",
            "polygon.com/sports-games",
            "kotaku.com/sports-games",
            "twitch.tv/directory/game/EA-Sports-FC-24",
            "ea.com/games/nba-live",
        ],
        "Music": [
            "pitchfork.com/reviews",
            "genius.com/artists",
            "stereogum.com/category/music",
            "audiomack.com/trending",
            "soundcloud.com/discover",
            "spotify.com/browse/featured",
        ],
        "Youth Culture": [
            "vice.com/en/section/culture",
            "thefader.com/style",
            "pigeons-and-planes.com",
            "xxlmag.com/category/lifestyle",
            "teenvogue.com/fashion",
            "highsnobiety.com/style",
        ],
        "Outdoor Activities": [
            "outsideonline.com/outdoor-adventure",
            "rei.com/blog",
            "backpacker.com/gear",
            "trailrunner.com/gear",
            "climbing.com/gear",
            "adventure-journal.com",
        ],
    }

    # Select placements based on recommended categories
    for category in recommended_categories:
        if category in category_websites and len(placements) < num_placements:
            sites = category_websites[category]
            selected_site = random.choice(sites)
            placements.append(selected_site)

    # Add some Nike-specific placements regardless of recommendations
    nike_specific_placements = [
        "espn.com/nba/standings",
        "bleacherreport.com/sneakers",
        "complex.com/sneakers/best-nike",
        "hypebeast.com/tags/nike",
        "highsnobiety.com/nike",
        "footlocker.com/category/brand/nike",
        "kicksonfire.com/brand/nike",
        "nicekicks.com/air-jordan",
        "solecollector.com/nike",
    ]

    # Add 1-3 Nike-specific placements
    num_nike_placements = min(3, num_placements - len(placements))
    if num_nike_placements > 0:
        selected_nike_placements = random.sample(
            nike_specific_placements, num_nike_placements
        )
        placements.extend(selected_nike_placements)

    # Add some random placements if needed to reach num_placements
    while len(placements) < num_placements:
        random_category = random.choice(list(category_websites.keys()))
        sites = category_websites[random_category]
        selected_site = random.choice(sites)
        if selected_site not in placements:  # Avoid duplicates
            placements.append(selected_site)

    # Above fold percentage - Nike pays for premium placements
    above_fold_percentage = random.uniform(0.55, 0.85)

    return AdPlacement(
        website_categories=website_categories,
        specific_placements=placements,
        above_fold_percentage=above_fold_percentage,
    )


async def mock_enhanced_ad_metrics(
    ad_analysis: AdAnalysis, batch_id: int
) -> List[EnhancedAdMetric]:
    """Generate comprehensive mock metrics for a Nike shoe ad (one row per ad)"""
    metrics_list = []
    try:
        # Check if metrics already exist for this ad
        supabase_client = get_supabase_client()
        existing_metrics = (
            supabase_client.table("enhanced_ad_metrics")
            .select("ad_id")
            .eq("ad_id", str(ad_analysis.id))
            .execute()
        )

        if existing_metrics.data:
            print(
                f"[Batch {batch_id}] Metrics already exist for ad {ad_analysis.id}, skipping..."
            )
            return metrics_list

        print(f"[Batch {batch_id}] Starting processing for ad {ad_analysis.id}")

        # First, randomly select channels
        selected_channels = select_random_channels()

        # Fetch related market research data
        market_research = await fetch_market_research_data(
            supabase_client, ad_analysis.id
        )
        print(f"[Batch {batch_id}] Fetched market research for ad {ad_analysis.id}")

        # Get AI-based recommendations with pre-selected channels
        print(
            f"[Batch {batch_id}] Requesting GPT recommendations for ad {ad_analysis.id}"
        )
        recommendations = await get_gpt4_recommendations(
            ad_analysis, market_research, pre_selected_channels=selected_channels
        )
        print(
            f"[Batch {batch_id}] Received GPT recommendations for ad {ad_analysis.id}"
        )

        # Convert channel recommendations to a dictionary
        channel_scores = {
            rec.channel: rec.relevance_score
            for rec in recommendations.channel_recommendations.recommendations
        }
        print(
            f"[Batch {batch_id}] Selected {len(channel_scores)} channels for ad {ad_analysis.id}"
        )

        # Generate a campaign ID with Nike specific naming
        campaign_id = f"NKSH-{ad_analysis.id.hex[:8]}"

        # Generate aggregated metrics across all channels
        total_impressions = 0
        total_clicks = 0
        total_conversions = 0
        total_cost = 0
        total_viewable_impressions = 0
        weighted_quality_score = 0
        total_weight = 0

        # Generate demographics, devices, engagement and placement metrics
        demographics = generate_demographics(recommendations)
        device_metrics = generate_device_metrics()
        engagement = generate_engagement_metrics(recommendations)
        placement = generate_ad_placement(recommendations)

        # Base impression range varies by ad quality and number of channels
        base_impression_multiplier = (recommendations.quality_score / 7.0) * len(
            channel_scores
        )
        base_impressions_min = int(4000 * base_impression_multiplier)
        base_impressions_max = int(12000 * base_impression_multiplier)

        # Calculate aggregated metrics across channels
        for channel, relevance_score in channel_scores.items():
            if relevance_score < 0.5:
                continue

            # Get baseline metrics for this channel
            baseline = CHANNEL_BASELINES.get(
                channel.value, {"ctr": 0.01, "cpc": 1.2, "conv_rate": 0.015}
            )

            # Apply quality modifiers with randomization
            quality_score = recommendations.quality_score * random.uniform(
                0.9, 1.1
            )  # Add some variance
            ctr_modifier = recommendations.expected_ctr_modifier * random.uniform(
                0.85, 1.15
            )
            conv_rate_modifier = (
                recommendations.expected_conversion_rate_modifier
                * random.uniform(0.85, 1.15)
            )
            cost_modifier = recommendations.expected_cost_modifier * random.uniform(
                0.9, 1.1
            )

            # Generate base metrics with channel weight and randomization
            channel_weight = relevance_score * random.uniform(0.9, 1.1)
            channel_impressions = int(
                random.randint(base_impressions_min, base_impressions_max)
                * channel_weight
            )

            # Calculate channel metrics with more variation
            adjusted_ctr = (
                baseline["ctr"]
                * ctr_modifier
                * (quality_score / 5)
                * random.uniform(0.9, 1.1)
            )
            adjusted_ctr = max(0.0012, min(0.025, adjusted_ctr))

            channel_clicks = int(channel_impressions * adjusted_ctr)
            adjusted_conv_rate = (
                baseline["conv_rate"]
                * conv_rate_modifier
                * (quality_score / 5)
                * random.uniform(0.9, 1.1)
            )
            adjusted_conv_rate = max(0.0008, min(0.035, adjusted_conv_rate))
            channel_conversions = int(channel_clicks * adjusted_conv_rate)

            # Calculate cost with variation
            adjusted_cpc = (
                baseline["cpc"]
                * cost_modifier
                * (1 + (quality_score - 5) / 10)
                * random.uniform(0.95, 1.05)
            )
            channel_cost = channel_clicks * adjusted_cpc

            # Calculate viewable impressions with variation
            viewability_rate = random.uniform(0.60, 0.95)  # Wider range for variation
            channel_viewable_impressions = int(channel_impressions * viewability_rate)

            # Aggregate metrics
            total_impressions += channel_impressions
            total_clicks += channel_clicks
            total_conversions += channel_conversions
            total_cost += channel_cost
            total_viewable_impressions += channel_viewable_impressions
            weighted_quality_score += quality_score * channel_weight
            total_weight += channel_weight

        # Calculate final aggregated metrics
        final_quality_score = (
            weighted_quality_score / total_weight
            if total_weight > 0
            else recommendations.quality_score
        )
        final_ctr = total_clicks / total_impressions if total_impressions > 0 else 0
        final_conversion_rate = (
            total_conversions / total_clicks if total_clicks > 0 else 0
        )
        final_cpc = total_cost / total_clicks if total_clicks > 0 else 0
        final_cpm = (
            (total_cost / total_impressions) * 1000 if total_impressions > 0 else 0
        )
        final_viewability_rate = (
            total_viewable_impressions / total_impressions
            if total_impressions > 0
            else 0
        )

        # Calculate ROAS with product-appropriate variation
        avg_order_value = random.uniform(
            110, 280
        )  # Wider range for different Nike products
        revenue = total_conversions * avg_order_value
        roas = revenue / total_cost if total_cost > 0 else 0

        # Select primary channel based on highest relevance score
        primary_channel = max(channel_scores.items(), key=lambda x: x[1])[0]

        # Create single metric record
        metric = EnhancedAdMetric(
            ad_id=ad_analysis.id,
            campaign_id=campaign_id,
            channel=primary_channel,  # Use highest relevance channel
            impressions=total_impressions,
            clicks=total_clicks,
            ctr=final_ctr,
            conversions=total_conversions,
            conversion_rate=final_conversion_rate,
            cost=total_cost,
            cpc=final_cpc,
            cpm=final_cpm,
            roas=roas,
            viewable_impressions=total_viewable_impressions,
            viewability_rate=final_viewability_rate,
            demographics=demographics,
            device_metrics=device_metrics,
            engagement=engagement,
            placement=placement,
            date=datetime.now().strftime("%Y-%m-%d"),
            quality_score=final_quality_score,
        )
        metrics_list.append(metric)

        # Store single metric in database
        try:
            dict_metric = {
                k: v for k, v in metric.model_dump(mode="json").items() if v is not None
            }

            # Execute the upsert operation with correct conflict handling
            response = (
                supabase_client.table("enhanced_ad_metrics")
                .upsert(
                    dict_metric,
                    count="exact",
                    on_conflict="ad_id",  # Specify the conflict column
                )
                .execute()
            )

            if hasattr(response, "error") and response.error:
                raise Exception(f"Supabase error: {response.error}")

            print(f"[Batch {batch_id}] Stored metrics for ad {ad_analysis.id}")

        except Exception as e:
            print(
                f"[Batch {batch_id}] Error storing metrics for ad {ad_analysis.id}: {str(e)}"
            )
            return metrics_list  # Return empty list on error to prevent retries

        print(f"[Batch {batch_id}] Completed processing ad {ad_analysis.id}")
        return metrics_list

    except Exception as e:
        print(f"[Batch {batch_id}] Error processing ad {ad_analysis.id}: {str(e)}")
        return metrics_list


async def process_ad_batch(ad_batch: List[AdAnalysis], batch_id: int) -> None:
    """Process a batch of Nike shoe ads in parallel with optimized database operations"""
    try:
        print(f"\n[Batch {batch_id}] Starting batch with {len(ad_batch)} Nike shoe ads")
        start_time = time.time()

        # Process ads in parallel
        tasks = [mock_enhanced_ad_metrics(ad, batch_id) for ad in ad_batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect successful metrics for batch insert
        batch_metrics = []
        successful_ads = 0

        for result in results:
            if isinstance(result, list) and result:  # Successful result
                batch_metrics.extend(
                    [
                        {
                            k: v
                            for k, v in metric.model_dump(mode="json").items()
                            if v is not None
                        }
                        for metric in result
                    ]
                )
                successful_ads += 1
            elif isinstance(result, Exception):  # Exception occurred
                print(f"[Batch {batch_id}] Failed to process an ad: {str(result)}")

        # Batch upsert to database if we have metrics
        if batch_metrics:
            try:
                supabase_client = get_supabase_client()
                response = (
                    supabase_client.table("enhanced_ad_metrics")
                    .upsert(
                        batch_metrics,
                        count="exact",
                        on_conflict="ad_id",  # Specify the conflict column
                    )
                    .execute()
                )

                if hasattr(response, "error") and response.error:
                    raise Exception(f"Supabase batch error: {response.error}")

                print(
                    f"[Batch {batch_id}] Successfully stored {len(batch_metrics)} metrics in batch"
                )
            except Exception as e:
                print(f"[Batch {batch_id}] Error in batch storage: {str(e)}")
                # Fallback to individual inserts if batch fails
                print(f"[Batch {batch_id}] Falling back to individual inserts...")
                for metric in batch_metrics:
                    try:
                        response = (
                            supabase_client.table("enhanced_ad_metrics")
                            .upsert(
                                [metric],
                                count="exact",
                                on_conflict="ad_id",  # Specify the conflict column
                            )
                            .execute()
                        )
                    except Exception as inner_e:
                        print(
                            f"[Batch {batch_id}] Error storing individual metric: {str(inner_e)}"
                        )

        processing_time = time.time() - start_time
        print(f"\n[Batch {batch_id}] Batch completed in {processing_time:.2f} seconds:")
        print(f"- Successfully processed {successful_ads}/{len(ad_batch)} ads")
        print(f"- Generated and stored {len(batch_metrics)} Nike ad metrics")
        print(f"- Average {processing_time / len(ad_batch):.2f} seconds per ad")
        if successful_ads > 0:
            print(
                f"- Average {len(batch_metrics) / successful_ads:.1f} metrics per successful ad\n"
            )

    except Exception as e:
        print(f"[Batch {batch_id}] Error processing batch: {str(e)}")


async def main():
    # Get all ad analyses
    start_time = time.time()
    print("Fetching Nike ad analyses from database...")

    # Replace asyncio.to_thread with loop.run_in_executor
    loop = asyncio.get_event_loop()
    ad_analyses = await loop.run_in_executor(None, get_ad_analyses_from_db)

    print(
        f"Retrieved {len(ad_analyses)} Nike ad analyses in {time.time() - start_time:.2f} seconds"
    )

    # Check for OpenAI API key
    if not openai_api_key:
        print(
            "Warning: OPENAI_API_KEY not found. GPT-4o-mini integration will not work."
        )

    # First, check how many ads already have metrics
    supabase_client = get_supabase_client()
    existing_metrics = (
        supabase_client.table("enhanced_ad_metrics").select("ad_id").execute()
    )
    existing_ad_ids = {metric["ad_id"] for metric in existing_metrics.data}

    # Filter out ads that already have metrics
    ads_to_process = [ad for ad in ad_analyses if str(ad.id) not in existing_ad_ids]

    if not ads_to_process:
        print("All ads already have metrics. No new processing needed.")
        return

    print(
        f"Processing {len(ads_to_process)} Nike shoe ads (skipping {len(existing_ad_ids)} existing)"
    )

    # Process in batches to avoid overwhelming API and database
    batch_size = 8
    batches = [
        ads_to_process[i : i + batch_size]
        for i in range(0, len(ads_to_process), batch_size)
    ]

    # Process batches in parallel up to a limit
    max_concurrent_batches = 5
    semaphore = asyncio.Semaphore(max_concurrent_batches)

    async def process_batch_with_semaphore(batch, batch_id):
        async with semaphore:
            await process_ad_batch(batch, batch_id)

    # Create tasks for all batches
    tasks = [process_batch_with_semaphore(batch, i) for i, batch in enumerate(batches)]

    # Process all batches with progress tracking
    for task in tqdm(
        asyncio.as_completed(tasks),
        total=len(tasks),
        desc="Generating enhanced Nike ad metrics",
    ):
        await task

    print(f"Total processing time: {time.time() - start_time:.2f} seconds")
    print("Enhanced Nike shoe ad metrics generation complete!")


if __name__ == "__main__":
    asyncio.run(main())
