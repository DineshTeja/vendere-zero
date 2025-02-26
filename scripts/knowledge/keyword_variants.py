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


class KeywordVariantGenerator:
    """Generator for keyword variants based on ad features"""

    def __init__(self):
        """Initialize the keyword variant generator"""
        try:
            # Initialize Supabase client
            supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")

            # Try to use service key first, fall back to anon key if not available
            supabase_service_key = os.getenv("NEXT_PUBLIC_SUPABASE_SERVICE_KEY")
            supabase_anon_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

            # Choose which key to use
            supabase_key = (
                supabase_service_key if supabase_service_key else supabase_anon_key
            )
            key_type = "service key" if supabase_service_key else "anon key"

            if not supabase_url or not supabase_key:
                raise ValueError(
                    "Missing Supabase environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your .env.local file."
                )

            logger.info(f"Initializing Supabase client with {key_type}")
            self.supabase = create_client(
                supabase_url,
                supabase_key,
                options=ClientOptions(
                    postgrest_client_timeout=60,
                    schema="public",
                ),
            )

            # Initialize LLM
            self.llm = OpenAI(model="gpt-4o-mini", temperature=0.2)

            # Initialize vector store and index for ad retrieval
            self._initialize_ad_index()

            # Initialize keyword similarity model
            self._initialize_keyword_similarity()

            logger.info("KeywordVariantGenerator initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing KeywordVariantGenerator: {str(e)}")
            raise

    def _initialize_ad_index(self):
        """Initialize vector store and index with ad data from available tables"""
        try:

            # Use the RPC function to get joined data from market research and library items
            logger.info("Calling RPC function 'join_market_research_and_library_items'")
            try:
                joined_data_response = self.supabase.rpc(
                    "join_market_research_and_library_items"
                ).execute()
                joined_data = joined_data_response.data
                logger.info(
                    f"RPC function returned {len(joined_data) if joined_data else 0} records"
                )
            except Exception as e:
                logger.error(f"Error calling RPC function: {str(e)}")
                joined_data = []

            if not joined_data:
                logger.warning(
                    "No joined data found from market research and library items"
                )

                # Fallback: Manually join the data
                logger.info("Attempting manual join as fallback...")
                try:
                    # Get all market research data
                    mr_all = (
                        self.supabase.table("market_research_v2")
                        .select("*")
                        .execute()
                        .data
                    )
                    logger.info(f"Retrieved {len(mr_all)} market research records")

                    # Get all library items
                    li_all = (
                        self.supabase.table("library_items").select("*").execute().data
                    )
                    logger.info(f"Retrieved {len(li_all)} library items")

                    # Create a dictionary of library items by preview_url for faster lookup
                    li_by_url = {
                        item.get("preview_url"): item
                        for item in li_all
                        if item.get("preview_url")
                    }

                    # Manually join the data
                    joined_data = []
                    for mr_item in mr_all:
                        image_url = mr_item.get("image_url")
                        if image_url and image_url in li_by_url:
                            li_item = li_by_url[image_url]

                            # Create a joined record with the same structure as the RPC function
                            joined_record = {
                                "mr_id": mr_item.get("id"),
                                "mr_user_id": mr_item.get("user_id"),
                                "mr_image_url": mr_item.get("image_url"),
                                "mr_created_at": mr_item.get("created_at"),
                                "mr_intent_summary": mr_item.get("intent_summary"),
                                "mr_target_audience": mr_item.get("target_audience"),
                                "mr_pain_points": mr_item.get("pain_points"),
                                "mr_buying_stage": mr_item.get("buying_stage"),
                                "mr_key_features": mr_item.get("key_features"),
                                "mr_competitive_advantages": mr_item.get(
                                    "competitive_advantages"
                                ),
                                "mr_perplexity_insights": mr_item.get(
                                    "perplexity_insights"
                                ),
                                "mr_citations": mr_item.get("citations"),
                                "mr_keywords": mr_item.get("keywords"),
                                "mr_original_headlines": mr_item.get(
                                    "original_headlines"
                                ),
                                "mr_new_headlines": mr_item.get("new_headlines"),
                                "li_id": li_item.get("id"),
                                "li_type": li_item.get("type"),
                                "li_name": li_item.get("name"),
                                "li_description": li_item.get("description"),
                                "li_user_id": li_item.get("user_id"),
                                "li_created_at": li_item.get("created_at"),
                                "li_item_id": li_item.get("item_id"),
                                "li_features": li_item.get("features"),
                                "li_sentiment_tones": li_item.get("sentiment_tones"),
                                "li_avg_sentiment_confidence": li_item.get(
                                    "avg_sentiment_confidence"
                                ),
                                "li_preview_url": li_item.get("preview_url"),
                            }
                            joined_data.append(joined_record)

                    logger.info(
                        f"Manual join found {len(joined_data)} matching records"
                    )

                    if not joined_data:
                        logger.warning("Manual join also found no matching records")
                        return

                except Exception as e:
                    logger.error(f"Error in manual join fallback: {str(e)}")
                    return

            logger.info(
                f"Found {len(joined_data)} joined entries from market research and library items"
            )

            # Create documents for vector indexing
            documents = []

            # Process joined data
            for entry in joined_data:
                try:
                    # Extract visual elements from the image URL
                    visual_elements = []
                    if entry.get("mr_image_url"):
                        visual_elements.append(f"Image: {entry.get('mr_image_url')}")

                    # Extract keywords from market research
                    keywords = []
                    if entry.get("mr_keywords"):
                        for kw_obj in entry.get("mr_keywords", []):
                            if isinstance(kw_obj, dict) and "text" in kw_obj:
                                keywords.append(kw_obj["text"])
                            elif isinstance(kw_obj, str):
                                keywords.append(kw_obj)

                    # Create a combined document with both market research and library item data
                    combined_text = f"""
                    # Market Research Data
                    Intent Summary: {entry.get("mr_intent_summary", "")}
                    Target Audience: {json.dumps(entry.get("mr_target_audience", {}), indent=2)}
                    Pain Points: {json.dumps(entry.get("mr_pain_points", {}), indent=2)}
                    Buying Stage: {entry.get("mr_buying_stage", "")}
                    Key Features: {json.dumps(entry.get("mr_key_features", {}), indent=2)}
                    Competitive Advantages: {json.dumps(entry.get("mr_competitive_advantages", {}), indent=2)}
                    
                    # Library Item Data
                    Type: {entry.get("li_type", "")}
                    Name: {entry.get("li_name", "")}
                    Description: {entry.get("li_description", "")}
                    Features: {json.dumps(entry.get("li_features", []), indent=2)}
                    Sentiment Tones: {json.dumps(entry.get("li_sentiment_tones", []), indent=2)}
                    
                    # Shared Data
                    Visual Elements: {', '.join(visual_elements)}
                    Keywords: {json.dumps(keywords, indent=2)}
                    Image URL: {entry.get("mr_image_url", "")}
                    """

                    doc = Document(
                        text=combined_text,
                        extra_info={
                            "type": "combined_data",
                            "mr_id": entry.get("mr_id"),
                            "li_id": entry.get("li_id"),
                            "image_url": entry.get("mr_image_url"),
                        },
                    )
                    documents.append(doc)
                except Exception as e:
                    logger.error(f"Error processing joined entry: {str(e)}")
                    continue

            logger.info(f"Created {len(documents)} documents for vector indexing")

            # Initialize vector store
            db_connection = os.getenv("DB_CONNECTION")
            if not db_connection:
                raise ValueError("Missing DB_CONNECTION environment variable")

            # Clean up the connection string to remove any extra spaces
            db_connection = db_connection.strip()

            # Fix common SSL mode issues by ensuring proper format
            if "sslmode=" in db_connection:
                # Replace any sslmode with extra spaces
                db_connection = db_connection.replace(
                    "sslmode=require ", "sslmode=require"
                )
                db_connection = db_connection.replace(
                    "sslmode= require", "sslmode=require"
                )
                db_connection = db_connection.replace(
                    "sslmode = require", "sslmode=require"
                )

            logger.info(f"Using database connection with cleaned SSL mode")

            vector_store = SupabaseVectorStore(
                postgres_connection_string=db_connection,
                collection_name="ad_research",
            )
            storage_context = StorageContext.from_defaults(vector_store=vector_store)

            # Create index
            self.index = VectorStoreIndex.from_documents(
                documents,
                storage_context=storage_context,
            )

            # Initialize query engine
            self.query_engine = self.index.as_query_engine(
                similarity_top_k=5,
                response_mode="compact",
            )

            logger.info("Ad vector index initialized successfully")
        except Exception as e:
            logger.error(f"Error in _initialize_ad_index: {str(e)}")
            raise

    def _initialize_keyword_similarity(self):
        """Initialize the keyword similarity model using the semrush_keywords table"""
        try:
            # Fetch all keywords from the semrush_keywords table
            result = self.supabase.table("semrush_keywords").select("*").execute()
            self.semrush_keywords = result.data

            logger.info(
                f"Loaded {len(self.semrush_keywords)} keywords from semrush_keywords table"
            )

            # Create a mapping of keywords to their data for quick lookup
            self.keyword_data_map = {
                item["keyword"]: item for item in self.semrush_keywords
            }

            # Create multiple similarity models for different aspects of keywords

            # 1. Character n-gram similarity (good for typos and small variations)
            keywords = [item["keyword"] for item in self.semrush_keywords]
            self.char_vectorizer = TfidfVectorizer(
                analyzer="char_wb", ngram_range=(2, 5)
            )
            self.char_vectors = self.char_vectorizer.fit_transform(keywords)

            # 2. Word-level similarity (good for word order and synonyms)
            self.word_vectorizer = TfidfVectorizer(analyzer="word", ngram_range=(1, 2))
            self.word_vectors = self.word_vectorizer.fit_transform(keywords)

            logger.info("Keyword similarity models initialized successfully")
        except Exception as e:
            logger.error(f"Error in _initialize_keyword_similarity: {str(e)}")
            raise

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

    async def _generate_keyword_variants(self, ad_features: AdFeatures) -> List[str]:
        """Generate new keyword variants using LLM"""
        try:
            # Incorporate joined data
            joined_data = await self._incorporate_joined_data(ad_features)

            # Extract additional keywords from joined data if available
            additional_keywords = []
            if joined_data and "keywords" in joined_data and joined_data["keywords"]:
                additional_keywords = joined_data["keywords"]

            # Construct a detailed prompt for the LLM
            prompt = f"""
            Generate keyword variants for a Nike display ad with the following features:
            
            Visual Cues: {', '.join(ad_features.visual_cues)}
            Pain Points: {', '.join(ad_features.pain_points)}
            Visitor Intent: {ad_features.visitor_intent}
            Target Audience: {json.dumps(ad_features.target_audience, indent=2)}
            {f"Product Category: {ad_features.product_category}" if ad_features.product_category else ""}
            {f"Campaign Objective: {ad_features.campaign_objective}" if ad_features.campaign_objective else ""}
            """

            # Add joined data context if available
            if joined_data:
                prompt += f"""
                
                Additional Context from Market Research and Library Items:
                """

                if joined_data.get("intent_summaries"):
                    prompt += f"""
                Intent Summaries:
                {json.dumps(joined_data["intent_summaries"][:2], indent=2)}
                """

                if joined_data.get("pain_points"):
                    prompt += f"""
                Additional Pain Points:
                {json.dumps(joined_data["pain_points"][:2], indent=2)}
                """

                if joined_data.get("target_audiences"):
                    prompt += f"""
                Additional Target Audience Information:
                {json.dumps(joined_data["target_audiences"][:2], indent=2)}
                """

                if additional_keywords:
                    prompt += f"""
                Related Keywords:
                {', '.join(additional_keywords[:10])}
                """

                if joined_data.get("features"):
                    prompt += f"""
                Visual Features: {', '.join(joined_data["features"][:10])}
                """

                if joined_data.get("sentiment_tones"):
                    prompt += f"""
                Sentiment Tones: {', '.join(joined_data["sentiment_tones"])}
                """

            prompt += f"""
            
            Generate 25 keyword variants that:
            1. Match the visitor intent ({ad_features.visitor_intent})
            2. Address the pain points mentioned
            3. Appeal to the target audience characteristics
            4. Include a mix of:
               - Short-tail keywords (1-2 words)
               - Medium-tail keywords (3-4 words)
               - Long-tail keywords (5+ words)
               - Question-based keywords (how, what, why, etc.)
            5. Consider different stages of the buyer journey:
               - Awareness stage keywords
               - Consideration stage keywords
               - Decision stage keywords
            
            For each keyword, consider:
            - Search intent alignment
            - Relevance to Nike's brand and products
            - Specificity to the ad's message
            - Natural language patterns people use when searching
            
            
            Format your response as a JSON object with a single key "keywords" containing an array of strings.
            Example:
            {{"keywords": ["nike running shoes", "best nike shoes for marathon", "how to choose nike running shoes", ...]}}
            """

            # Generate keywords using the LLM
            response = self.llm.complete(
                prompt, response_format={"type": "json_object"}
            )

            # Parse the JSON response
            try:
                generated_data = json.loads(response.text)
                keywords = generated_data.get("keywords", [])

                # Ensure all keywords are strings and unique
                keywords = list(set([str(kw).strip() for kw in keywords if kw]))

                # Add unique keywords from joined data
                if additional_keywords:
                    all_keywords = keywords + additional_keywords
                    keywords = list(set([str(kw).strip() for kw in all_keywords if kw]))

                logger.info(f"Generated {len(keywords)} unique keyword variants")
                return keywords

            except json.JSONDecodeError:
                logger.error("Failed to parse LLM response as JSON")
                return []

        except Exception as e:
            logger.error(f"Error in _generate_keyword_variants: {str(e)}")
            return []

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
            # If no similar keywords found, return default values
            if not similar_keywords:
                return {
                    "search_volume": 0,
                    "cpc": 0.0,
                    "keyword_difficulty": 0.0,
                    "competition": 0.0,
                    "confidence": 0.0,
                }

            # Check if we have an exact match (100% similarity)
            for kw in similar_keywords:
                if kw["similarity"] > 0.99:  # Exact or near-exact match
                    return {
                        "search_volume": kw["metrics"]["search_volume"],
                        "cpc": kw["metrics"]["cpc"],
                        "keyword_difficulty": kw["metrics"]["keyword_difficulty"],
                        "competition": kw["metrics"]["competition"],
                        "confidence": 1.0,  # High confidence for exact match
                    }

            # Calculate weighted average based on similarity scores
            total_weight = sum(kw["similarity"] for kw in similar_keywords)

            # If total weight is too low, confidence will be low
            confidence = min(1.0, total_weight / len(similar_keywords) * 2)

            # Calculate weighted metrics
            search_volume = (
                sum(
                    kw["metrics"]["search_volume"] * kw["similarity"]
                    for kw in similar_keywords
                )
                / total_weight
            )
            cpc = (
                sum(kw["metrics"]["cpc"] * kw["similarity"] for kw in similar_keywords)
                / total_weight
            )
            keyword_difficulty = (
                sum(
                    kw["metrics"]["keyword_difficulty"] * kw["similarity"]
                    for kw in similar_keywords
                )
                / total_weight
            )
            competition = (
                sum(
                    kw["metrics"]["competition"] * kw["similarity"]
                    for kw in similar_keywords
                )
                / total_weight
            )

            # Apply adjustments based on keyword characteristics
            # Longer keywords typically have lower volume but higher conversion
            word_count = len(keyword.split())
            if word_count > 3:  # Long-tail keyword
                search_volume = search_volume * 0.8  # Typically lower volume
                competition = competition * 0.7  # Typically lower competition

            # Question-based keywords often have different metrics
            if any(
                q in keyword.lower()
                for q in ["how", "what", "why", "when", "where", "which"]
            ):
                search_volume = search_volume * 0.9  # Often lower volume
                cpc = cpc * 0.9  # Often lower CPC

            # Brand keywords (containing "nike") have different characteristics
            if "nike" in keyword.lower():
                search_volume = search_volume * 1.2  # Higher volume for brand terms
                competition = competition * 1.1  # Higher competition for brand terms

            return {
                "search_volume": int(
                    max(0, search_volume)
                ),  # Ensure non-negative integer
                "cpc": float(max(0, cpc)),  # Ensure non-negative float
                "keyword_difficulty": float(
                    max(0, min(100, keyword_difficulty))
                ),  # 0-100 range
                "competition": float(max(0, min(1, competition))),  # 0-1 range
                "confidence": float(confidence),  # Confidence in the estimate
            }

        except Exception as e:
            logger.error(f"Error in _estimate_metrics for '{keyword}': {str(e)}")
            return {
                "search_volume": 0,
                "cpc": 0.0,
                "keyword_difficulty": 0.0,
                "competition": 0.0,
                "confidence": 0.0,
            }

    async def _enrich_keywords(
        self, keywords: List[str], source: str = "generated"
    ) -> List[KeywordVariant]:
        """Enrich keywords with estimated metrics based on similar keywords"""
        try:
            enriched_keywords = []

            # Process keywords in batches to avoid overwhelming logs
            batch_size = 10
            for i in range(0, len(keywords), batch_size):
                batch = keywords[i : i + batch_size]
                logger.info(
                    f"Enriching batch of {len(batch)} keywords ({i+1}-{min(i+batch_size, len(keywords))} of {len(keywords)})"
                )

                for keyword in batch:
                    # Find similar keywords in our database
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
                        competition_percentage=metrics["competition"],
                        confidence_score=metrics["confidence"],
                        similar_keywords=similar_keywords,
                    )

                    enriched_keywords.append(variant)

            logger.info(f"Enriched {len(enriched_keywords)} keywords with metrics")
            return enriched_keywords

        except Exception as e:
            logger.error(f"Error in _enrich_keywords: {str(e)}")
            return []

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
        """Generate explanations for each keyword using RAG"""
        try:
            if not keywords:
                return []

            # Process keywords in batches to avoid overwhelming the LLM
            batch_size = 5
            for i in range(0, len(keywords), batch_size):
                batch = keywords[i : i + batch_size]
                logger.info(
                    f"Generating explanations for batch of {len(batch)} keywords ({i+1}-{min(i+batch_size, len(keywords))} of {len(keywords)})"
                )

                for keyword in batch:
                    # Prepare context from similar keywords
                    similar_keywords_context = "\n".join(
                        [
                            f"- {kw['keyword']}: Volume={kw['metrics']['search_volume']}, CPC=${kw['metrics']['cpc']}, "
                            + f"Difficulty={kw['metrics']['keyword_difficulty']}, Competition={kw['metrics']['competition']}"
                            for kw in keyword.similar_keywords[
                                :3
                            ]  # Use top 3 similar keywords
                        ]
                    )

                    # Prepare metrics summary
                    metrics_summary = f"""
                    - Search Volume: {keyword.search_volume}
                    - CPC: ${keyword.cpc:.2f}
                    - Keyword Difficulty: {keyword.keyword_difficulty:.1f}/100
                    - Competition: {keyword.competition_percentage:.2f}
                    - Efficiency Index: {keyword.efficiency_index:.2f}
                    - Confidence Score: {keyword.confidence_score:.2f}
                    """

                    # Generate explanation using LLM
                    prompt = f"""
                    Explain why the keyword "{keyword.keyword}" might be effective for a Nike ad with the following characteristics:
                    
                    Ad Features:
                    - Visual Cues: {', '.join(ad_features.visual_cues)}
                    - Pain Points: {', '.join(ad_features.pain_points)}
                    - Visitor Intent: {ad_features.visitor_intent}
                    - Target Audience: {json.dumps(ad_features.target_audience, indent=2)}
                    {f"- Product Category: {ad_features.product_category}" if ad_features.product_category else ""}
                    {f"- Campaign Objective: {ad_features.campaign_objective}" if ad_features.campaign_objective else ""}
                    {f"- Image URL: {ad_features.image_url}" if ad_features.image_url else ""}
                    
                    Keyword Metrics:
                    {metrics_summary}
                    
                    Similar Keywords in Database:
                    {similar_keywords_context if similar_keywords_context else "No similar keywords found in database."}
                    
                    Provide a concise 3-4 sentence explanation that MUST include:
                    1. Why this keyword matches the ad's intent and audience
                    2. Why the metrics were estimated this way (based on similar keywords or other factors)
                    3. How the metrics suggest potential performance
                    4. Any optimization tips for using this keyword
                    
                    IMPORTANT: You must explicitly explain WHY the search volume, CPC, difficulty, and competition metrics were estimated as they were.
                    
                    Keep your explanation under 120 words and focus on actionable insights.
                    """

                    response = self.llm.complete(prompt)
                    keyword.explanation = response.text.strip()

            logger.info(f"Generated explanations for {len(keywords)} keywords")
            return keywords

        except Exception as e:
            logger.error(f"Error in _generate_explanations: {str(e)}")
            return keywords  # Return original keywords if explanation generation fails

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
            # The exact numbers can be adjusted based on preference
            top_short = short_tail[:5] if short_tail else []
            top_medium = medium_tail[:8] if medium_tail else []
            top_long = long_tail[:5] if long_tail else []
            top_questions = question_based[:3] if question_based else []

            # Combine top keywords from each segment
            diverse_top = top_short + top_medium + top_long + top_questions

            # Sort the diverse top keywords by efficiency index
            diverse_top.sort(key=lambda k: k.efficiency_index, reverse=True)

            # Get remaining keywords (those not in the diverse top)
            remaining = [k for k in ranked_keywords if k not in diverse_top]

            # Combine diverse top keywords with remaining keywords
            final_ranked = diverse_top + remaining

            logger.info(f"Ranked and prioritized {len(final_ranked)} keywords")
            return final_ranked

        except Exception as e:
            logger.error(f"Error in _rank_and_prioritize: {str(e)}")
            return keywords  # Return original keywords if ranking fails

    async def save_keywords_to_database(
        self, keywords: List[KeywordVariant], ad_features: AdFeatures
    ) -> bool:
        """Save generated keywords to the database for future use"""
        try:
            if not keywords:
                logger.warning("No keywords to save to database")
                return False

            # Create a new table if it doesn't exist yet
            # This table will store our generated keywords with their metrics and context
            try:
                # Check if the table exists
                self.supabase.table("generated_keywords").select("id").limit(
                    1
                ).execute()
            except Exception:
                logger.info("Creating generated_keywords table")
                # Table doesn't exist, create it
                # Note: In a real implementation, you would create this table through migrations
                # This is just for demonstration purposes
                pass

            # Get joined data for additional context
            joined_data = await self._incorporate_joined_data(ad_features)

            # Extract image URLs from joined data
            image_urls = joined_data.get("image_urls", []) if joined_data else []

            # Prepare keywords for insertion
            keywords_to_insert = []
            for kw in keywords:
                # Convert keyword to dictionary format
                keyword_data = {
                    "keyword": kw.keyword,
                    "source": kw.source,
                    "search_volume": kw.search_volume,
                    "cpc": kw.cpc,
                    "keyword_difficulty": kw.keyword_difficulty,
                    "competition_percentage": kw.competition_percentage,
                    "efficiency_index": kw.efficiency_index,
                    "confidence_score": kw.confidence_score,
                    "explanation": kw.explanation,
                    "similar_keywords": [
                        {"keyword": sk["keyword"], "similarity": sk["similarity"]}
                        for sk in kw.similar_keywords[
                            :3
                        ]  # Store top 3 similar keywords
                    ],
                    "ad_context": {
                        "visual_cues": ad_features.visual_cues,
                        "pain_points": ad_features.pain_points,
                        "visitor_intent": ad_features.visitor_intent,
                        "product_category": ad_features.product_category,
                        "campaign_objective": ad_features.campaign_objective,
                    },
                    "joined_data_context": {
                        "image_urls": image_urls,
                        "features": joined_data.get("features", []),
                        "sentiment_tones": joined_data.get("sentiment_tones", []),
                    },
                    "created_at": datetime.datetime.now().isoformat(),
                }
                keywords_to_insert.append(keyword_data)

            # Insert in batches to avoid overwhelming the database
            batch_size = 50
            for i in range(0, len(keywords_to_insert), batch_size):
                batch = keywords_to_insert[i : i + batch_size]

                # In a real implementation, you would insert into your actual table
                # For demonstration, we'll just log the action
                logger.info(
                    f"Would insert batch of {len(batch)} keywords into database"
                )

                # Uncomment this to actually insert into the database
                # result = self.supabase.table("generated_keywords").insert(batch).execute()
                # logger.info(f"Inserted {len(result.data)} keywords into database")

            logger.info(
                f"Successfully prepared {len(keywords_to_insert)} keywords for database storage"
            )
            return True

        except Exception as e:
            logger.error(f"Error saving keywords to database: {str(e)}")
            return False

    async def generate_keyword_variants(
        self, ad_features: AdFeatures
    ) -> List[KeywordVariant]:
        """Main method to generate keyword variants"""
        try:
            logger.info(
                f"Starting keyword variant generation for ad with intent: {ad_features.visitor_intent}"
            )

            # 1. Retrieve similar content and their keywords
            similar_content = await self._retrieve_similar_content(ad_features)
            retrieved_keywords = [
                kw for content in similar_content for kw in content.get("keywords", [])
            ]
            logger.info(
                f"Retrieved {len(retrieved_keywords)} keywords from similar content"
            )

            # 2. Generate new keyword variants
            generated_keywords = await self._generate_keyword_variants(ad_features)
            logger.info(f"Generated {len(generated_keywords)} new keyword variants")

            # 3. Combine and deduplicate keywords
            all_keywords = list(set(retrieved_keywords + generated_keywords))
            logger.info(f"Combined into {len(all_keywords)} unique keywords")

            # 4. Enrich keywords with estimated metrics
            retrieved_enriched = await self._enrich_keywords(
                retrieved_keywords, source="retrieved"
            )
            generated_enriched = await self._enrich_keywords(
                generated_keywords, source="generated"
            )
            enriched_keywords = retrieved_enriched + generated_enriched
            logger.info(f"Enriched {len(enriched_keywords)} keywords with metrics")

            # 5. Calculate composite metrics
            scored_keywords = await self._calculate_composite_metrics(enriched_keywords)

            # 6. Generate explanations
            explained_keywords = await self._generate_explanations(
                scored_keywords, ad_features
            )

            # 7. Rank and prioritize
            ranked_keywords = await self._rank_and_prioritize(explained_keywords)
            logger.info(f"Returning {len(ranked_keywords)} ranked keyword variants")

            # 8. Save keywords to database (optional)
            # Uncomment the following line to save keywords to database
            # await self.save_keywords_to_database(ranked_keywords, ad_features)

            return ranked_keywords

        except Exception as e:
            logger.error(f"Error in generate_keyword_variants: {str(e)}")
            raise

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

            # Prepare data for export with proper typing
            export_data: Dict[str, Any] = {
                "ad_context": {
                    "visual_cues": ad_features.visual_cues,
                    "pain_points": ad_features.pain_points,
                    "visitor_intent": ad_features.visitor_intent,
                    "target_audience": ad_features.target_audience,
                    "product_category": ad_features.product_category,
                    "campaign_objective": ad_features.campaign_objective,
                },
                "image_url": (
                    ad_features.image_url if ad_features.image_url else "Not specified"
                ),
                "keywords": [],  # Will be populated with keyword data
                "export_timestamp": datetime.datetime.now().isoformat(),
                "total_keywords": len(generated_keywords),
                "metrics_explanation": {
                    "search_volume": "Monthly search volume for the keyword",
                    "cpc": "Average cost per click in USD",
                    "keyword_difficulty": "SEO difficulty score (0-100)",
                    "competition_percentage": "Percentage of competing ads (0-100)",
                    "efficiency_index": "Composite score of volume vs. difficulty (higher is better)",
                    "confidence_score": "Confidence in the metric estimates (0-1)",
                },
            }

            # Create a list to hold keyword data
            keywords_list: List[Dict[str, Any]] = []

            # Add each keyword with its metrics
            for kw in generated_keywords:
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
                keywords_list.append(keyword_data)

            # Assign the keywords list to the export data
            export_data["keywords"] = keywords_list

            # Write to JSON file
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)

            logger.info(
                f"Successfully exported {len(generated_keywords)} keywords to {output_path}"
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

            # Write to CSV file
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(headers)

                image_url = (
                    ad_features.image_url if ad_features.image_url else "Not specified"
                )

                # Sort keywords by efficiency index for better readability
                sorted_keywords = sorted(
                    generated_keywords, key=lambda k: k.efficiency_index, reverse=True
                )

                for kw in sorted_keywords:
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

            logger.info(
                f"Successfully exported {len(generated_keywords)} keywords for image URL '{image_url}' to {output_path}"
            )
            return output_path

        except Exception as e:
            logger.error(f"Error exporting keywords to CSV: {str(e)}")
            return None


class KeywordDashboard:
    """Dashboard for visualizing keyword variant results"""

    def generate_dashboard(
        self, ad_features: AdFeatures, keywords: List[KeywordVariant]
    ) -> Dict:
        """Generate dashboard data"""
        try:
            # Group keywords by category
            short_tail = []
            medium_tail = []
            long_tail = []
            question_based = []

            for kw in keywords:
                word_count = len(kw.keyword.split())
                if any(
                    q in kw.keyword.lower()
                    for q in ["how", "what", "why", "when", "where", "which"]
                ):
                    question_based.append(kw)
                elif word_count <= 2:
                    short_tail.append(kw)
                elif word_count <= 4:
                    medium_tail.append(kw)
                else:
                    long_tail.append(kw)

            # Calculate summary statistics
            avg_volume = (
                sum(kw.search_volume for kw in keywords) / len(keywords)
                if keywords
                else 0
            )
            avg_cpc = sum(kw.cpc for kw in keywords) / len(keywords) if keywords else 0
            avg_difficulty = (
                sum(kw.keyword_difficulty for kw in keywords) / len(keywords)
                if keywords
                else 0
            )
            avg_competition = (
                sum(kw.competition_percentage for kw in keywords) / len(keywords)
                if keywords
                else 0
            )
            avg_efficiency = (
                sum(kw.efficiency_index for kw in keywords) / len(keywords)
                if keywords
                else 0
            )

            # Create keyword data for dashboard
            keyword_data = []
            for kw in keywords:
                # Format similar keywords for display
                similar_kws = []
                for similar in kw.similar_keywords[:3]:  # Show top 3 similar keywords
                    similar_kws.append(
                        {
                            "keyword": similar["keyword"],
                            "similarity": round(similar["similarity"], 2),
                            "volume": similar["metrics"]["search_volume"],
                            "cpc": round(similar["metrics"]["cpc"], 2),
                            "difficulty": round(
                                similar["metrics"]["keyword_difficulty"], 1
                            ),
                            "competition": round(similar["metrics"]["competition"], 2),
                        }
                    )

                # Add keyword to dashboard data
                keyword_data.append(
                    {
                        "keyword": kw.keyword,
                        "source": kw.source,
                        "metrics": {
                            "search_volume": kw.search_volume,
                            "cpc": round(kw.cpc, 2),
                            "keyword_difficulty": round(kw.keyword_difficulty, 1),
                            "competition": round(kw.competition_percentage, 2),
                            "efficiency_index": round(kw.efficiency_index, 2),
                            "confidence_score": round(kw.confidence_score, 2),
                        },
                        "similar_keywords": similar_kws,
                        "explanation": kw.explanation,
                        "category": (
                            "question"
                            if kw in question_based
                            else (
                                "short_tail"
                                if kw in short_tail
                                else (
                                    "medium_tail" if kw in medium_tail else "long_tail"
                                )
                            )
                        ),
                    }
                )

            # Create the dashboard structure
            dashboard = {
                "ad_context": {
                    "visual_cues": ad_features.visual_cues,
                    "pain_points": ad_features.pain_points,
                    "visitor_intent": ad_features.visitor_intent,
                    "target_audience": ad_features.target_audience,
                    "product_category": ad_features.product_category,
                    "campaign_objective": ad_features.campaign_objective,
                },
                "summary_stats": {
                    "total_keywords": len(keywords),
                    "keyword_categories": {
                        "short_tail": len(short_tail),
                        "medium_tail": len(medium_tail),
                        "long_tail": len(long_tail),
                        "question_based": len(question_based),
                    },
                    "averages": {
                        "search_volume": round(avg_volume, 1),
                        "cpc": round(avg_cpc, 2),
                        "keyword_difficulty": round(avg_difficulty, 1),
                        "competition": round(avg_competition, 2),
                        "efficiency_index": round(avg_efficiency, 2),
                    },
                    "top_keywords": {
                        "highest_volume": (
                            max(keywords, key=lambda k: k.search_volume).keyword
                            if keywords
                            else None
                        ),
                        "highest_efficiency": (
                            max(keywords, key=lambda k: k.efficiency_index).keyword
                            if keywords
                            else None
                        ),
                        "lowest_difficulty": (
                            min(keywords, key=lambda k: k.keyword_difficulty).keyword
                            if keywords
                            else None
                        ),
                    },
                },
                "keywords": keyword_data,
                "generation_timestamp": datetime.datetime.now().isoformat(),
            }

            return dashboard

        except Exception as e:
            logger.error(f"Error generating dashboard: {str(e)}")
            # Return a minimal dashboard with error information
            return {
                "error": str(e),
                "ad_context": {
                    "visitor_intent": (
                        ad_features.visitor_intent if ad_features else "Unknown"
                    )
                },
                "summary_stats": {"total_keywords": len(keywords) if keywords else 0},
                "keywords": [],
                "generation_timestamp": datetime.datetime.now().isoformat(),
            }


class FeedbackProcessor:
    """Process feedback to improve keyword generation"""

    def __init__(self, supabase_client):
        """Initialize the feedback processor"""
        self.supabase = supabase_client

    async def record_feedback(
        self, keyword_id: str, performance_metrics: Dict, user_feedback: str
    ):
        """Record performance and feedback for a keyword"""
        try:
            # Create feedback record
            feedback_data = {
                "keyword_id": keyword_id,
                "performance_metrics": performance_metrics,
                "user_feedback": user_feedback,
                "timestamp": datetime.datetime.now().isoformat(),
            }

            # Insert into Supabase
            result = (
                self.supabase.table("keyword_feedback").insert(feedback_data).execute()
            )

            logger.info(f"Recorded feedback for keyword ID: {keyword_id}")
            return result.data

        except Exception as e:
            logger.error(f"Error recording feedback: {str(e)}")
            return None

    async def analyze_feedback_patterns(self):
        """Analyze feedback to identify patterns for model improvement"""
        try:
            # Retrieve all feedback data
            result = self.supabase.table("keyword_feedback").select("*").execute()
            feedback_data = result.data

            if not feedback_data:
                logger.warning("No feedback data available for analysis")
                return {"patterns": {}, "recommendations": []}

            # Analyze performance metrics
            avg_metrics = {}
            for metric in [
                "clicks",
                "impressions",
                "ctr",
                "conversions",
                "conversion_rate",
            ]:
                values = [
                    entry["performance_metrics"].get(metric, 0)
                    for entry in feedback_data
                    if entry.get("performance_metrics")
                    and metric in entry["performance_metrics"]
                ]
                avg_metrics[metric] = sum(values) / len(values) if values else 0

            # Analyze user feedback using LLM
            feedback_texts = [
                entry["user_feedback"]
                for entry in feedback_data
                if entry.get("user_feedback")
            ]

            if feedback_texts:
                # Use LLM to analyze feedback patterns
                analysis_prompt = f"""
                Analyze the following user feedback on keyword performance to identify patterns and improvement opportunities:
                
                {json.dumps(feedback_texts, indent=2)}
                
                Identify:
                1. Common themes in positive feedback
                2. Common themes in negative feedback
                3. Specific keyword characteristics that correlate with success
                4. Specific keyword characteristics that correlate with poor performance
                5. Recommendations for improving keyword generation
                
                Format your response as a JSON object with the following structure:
                {{
                    "positive_themes": ["theme1", "theme2", ...],
                    "negative_themes": ["theme1", "theme2", ...],
                    "success_factors": ["factor1", "factor2", ...],
                    "failure_factors": ["factor1", "factor2", ...],
                    "recommendations": ["recommendation1", "recommendation2", ...]
                }}
                """

                analysis_response = self.llm.complete(
                    analysis_prompt, response_format={"type": "json_object"}
                )

                try:
                    analysis_results = json.loads(analysis_response.text)
                except json.JSONDecodeError:
                    logger.error("Failed to parse LLM analysis response as JSON")
                    analysis_results = {
                        "positive_themes": [],
                        "negative_themes": [],
                        "success_factors": [],
                        "failure_factors": [],
                        "recommendations": [],
                    }
            else:
                analysis_results = {
                    "positive_themes": [],
                    "negative_themes": [],
                    "success_factors": [],
                    "failure_factors": [],
                    "recommendations": [],
                }

            # Combine metrics and analysis
            patterns = {
                "average_metrics": avg_metrics,
                "feedback_analysis": analysis_results,
            }

            logger.info(f"Analyzed {len(feedback_data)} feedback entries")
            return patterns

        except Exception as e:
            logger.error(f"Error analyzing feedback patterns: {str(e)}")
            return {"error": str(e), "patterns": {}, "recommendations": []}


# Example usage
async def main():
    """Example of how to use the keyword variant generator"""
    try:
        # Initialize the generator
        generator = KeywordVariantGenerator()

        # Create sample ad features for first image
        ad_features1 = AdFeatures(
            visual_cues=["running shoes", "athlete in motion", "track field"],
            pain_points=["foot discomfort", "slow performance", "lack of endurance"],
            visitor_intent="purchase",
            target_audience={
                "age_range": "18-35",
                "interests": ["running", "fitness", "athletics"],
                "gender": "all",
                "income_level": "middle to high",
            },
            product_category="athletic footwear",
            campaign_objective="increase sales of premium running shoes",
            image_url="https://example.com/nike_running_shoes.jpg",
        )

        # Generate keyword variants for first image
        print("Generating keyword variants for first image...")
        variants1 = await generator.generate_keyword_variants(ad_features1)

        # Filter to only include generated keywords
        generated_variants1 = [kw for kw in variants1 if kw.source == "generated"]
        print(f"Generated {len(generated_variants1)} keyword variants for first image")

        # Create sample ad features for second image
        ad_features2 = AdFeatures(
            visual_cues=["basketball shoes", "court", "jumping athlete"],
            pain_points=["ankle support", "court grip", "impact protection"],
            visitor_intent="research",
            target_audience={
                "age_range": "16-30",
                "interests": ["basketball", "streetwear", "urban culture"],
                "gender": "all",
                "income_level": "middle",
            },
            product_category="basketball footwear",
            campaign_objective="increase awareness of new basketball shoe line",
            image_url="https://example.com/nike_basketball_shoes.jpg",
        )

        # Generate keyword variants for second image
        print("\nGenerating keyword variants for second image...")
        variants2 = await generator.generate_keyword_variants(ad_features2)

        # Filter to only include generated keywords
        generated_variants2 = [kw for kw in variants2 if kw.source == "generated"]
        print(f"Generated {len(generated_variants2)} keyword variants for second image")

        # Combine all variants for export
        all_variants = variants1 + variants2
        all_generated_variants = generated_variants1 + generated_variants2

        # Create dashboard for first image (as an example)
        print(
            f"\nCreating dashboard for first image ({len(generated_variants1)} variants)..."
        )
        dashboard = KeywordDashboard().generate_dashboard(
            ad_features1, generated_variants1
        )

        # Print summary for first image
        print("\nKeyword Variant Generation Summary (First Image):")
        print(
            f"Total generated variants: {dashboard['summary_stats']['total_keywords']}"
        )
        print(f"Categories: {dashboard['summary_stats']['keyword_categories']}")
        print(f"Top keywords:")
        for category, keyword in dashboard["summary_stats"]["top_keywords"].items():
            print(f"  - {category}: {keyword}")

        # Print top 5 keywords by efficiency for first image
        print("\nTop 5 Generated Keywords by Efficiency (First Image):")
        top_keywords = sorted(
            generated_variants1, key=lambda k: k.efficiency_index, reverse=True
        )[:5]
        for i, kw in enumerate(top_keywords, 1):
            print(
                f"{i}. {kw.keyword} (Efficiency: {kw.efficiency_index:.2f}, Volume: {kw.search_volume})"
            )
            print(f"   Explanation: {kw.explanation[:100]}...")

        # Export all keywords to CSV and JSON
        print("\nExporting all generated keywords to CSV and JSON...")

        # Export each image's keywords separately to demonstrate image-keyword pairing
        csv_path1 = await generator.export_to_csv(
            variants1, ad_features1, output_path="exports/nike_running_keywords.csv"
        )
        csv_path2 = await generator.export_to_csv(
            variants2, ad_features2, output_path="exports/nike_basketball_keywords.csv"
        )

        # Export all keywords combined to demonstrate multiple image URLs in one file
        csv_path_combined = await generator.export_to_csv(all_variants, ad_features1)
        json_path_combined = await generator.export_to_json(all_variants, ad_features1)

        # Print export paths
        print("\nExport files:")
        if csv_path1:
            print(f"Running shoes keywords CSV: {csv_path1}")
        if csv_path2:
            print(f"Basketball shoes keywords CSV: {csv_path2}")
        if csv_path_combined:
            print(f"Combined keywords CSV: {csv_path_combined}")
        if json_path_combined:
            print(f"Combined keywords JSON: {json_path_combined}")

        # Print explanation of metrics
        print("\nMetrics Explanation:")
        print("- Estimated Search Volume: Monthly search volume for the keyword")
        print("- Estimated CPC ($): Average cost per click in USD")
        print(
            "- Estimated Keyword Difficulty: SEO difficulty score (0-100, lower is easier to rank for)"
        )
        print(
            "- Estimated Competition (%): Percentage of competing ads (0-100, lower means less competition)"
        )
        print(
            "- Efficiency Index: Composite score of volume vs. difficulty (higher is better)"
        )
        print(
            "- Confidence Score: Confidence in the metric estimates (0-1, higher is more reliable)"
        )

        # Print image-keyword relationship explanation
        print("\nImage-Keyword Relationship:")
        print("- Each image URL can have multiple generated keywords")
        print(
            "- Keywords are tailored to the specific visual elements and context of each image"
        )
        print("- The CSV exports show which keywords belong to which image URLs")
        print("- Metrics are estimated based on similar keywords in our database")

        print("\nKeyword variant generation completed successfully!")

    except Exception as e:
        print(f"Error in example: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
