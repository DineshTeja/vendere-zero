from llama_index.core.storage import StorageContext
from llama_index.core import VectorStoreIndex, Document, Settings
from llama_index.vector_stores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client, ClientOptions
from fastapi import FastAPI
from pydantic import BaseModel, Field
import json
import os
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import requests
import time
from functools import lru_cache
from collections import Counter, defaultdict
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from llama_index.core.llms import (
    CustomLLM,
    CompletionResponse,
    CompletionResponseGen,
    LLMMetadata,
)
from llama_index.core.llms.callbacks import llm_completion_callback
from pathlib import Path
from dotenv import load_dotenv
from company_context import COMPANY_CONTEXT
from qa_templates import create_qa_templates


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI"""
    # Initialize on startup
    global kb
    kb = KnowledgeBase()
    yield
    # Clean up on shutdown
    kb = None


app = FastAPI(title="Knowledge Base API", lifespan=lifespan)

env_path = Path(__file__).parents[2] / ".env.local"
load_dotenv(env_path)


class QueryRequest(BaseModel):
    query: str
    deep_research: bool = False  # Parameter kept for backward compatibility
    detail_level: int = Field(default=50, ge=0, le=100)
    attribution_analysis: bool = False  # Field for attribution analysis requests


class AttributionData(BaseModel):
    """Model for attribution data with campaign and channel metrics"""

    campaign_metrics: List[Dict[str, Any]] = []
    channel_metrics: List[Dict[str, Any]] = []
    top_performing_campaigns: List[Dict[str, Any]] = []
    top_performing_channels: List[Dict[str, Any]] = []
    top_performing_features: List[
        Dict[str, Any]
    ] = []  # Field for feature performance data
    feature_category_analysis: str = ""  # Analysis of top features by category
    feature_location_analysis: str = ""  # Analysis of top features by location
    attribution_insights: str = ""


class PerplexityLLM(CustomLLM):
    context_window: int = 4096
    num_output: int = 1024
    model: str = "sonar-reasoning-pro"
    temperature: float = 0.1
    api_key: str = None
    api_url: str = "https://api.perplexity.ai/chat/completions"
    last_citations: List[str] = []

    def __init__(
        self, model: str = "sonar-pro", temperature: float = 0.1, api_key: str = None
    ):
        super().__init__()
        self.model = model
        self.temperature = temperature
        self.api_key = api_key or os.getenv("PERPLEXITY_API_KEY")
        self.last_citations = []  # Reset citations on init
        if not self.api_key:
            raise ValueError("Perplexity API key not found")

    @property
    def metadata(self) -> LLMMetadata:
        """Get LLM metadata."""
        return LLMMetadata(
            context_window=self.context_window,
            num_output=self.num_output,
            model_name=self.model,
        )

    @llm_completion_callback()
    def complete(self, prompt: str, **kwargs: Any) -> CompletionResponse:
        """Complete the prompt using streaming to capture thinking tokens, but return final result"""
        # For non-reasoning models, just do a regular API call without streaming
        if "reasoning" not in self.model:
            return self._complete_without_streaming(prompt, **kwargs)

        # For reasoning models, use streaming to capture thinking tokens
        # but still return a complete response
        full_response = ""

        for response in self.stream_complete(prompt, **kwargs):
            # Just collect the full response for returning at the end
            full_response = response.text

        return CompletionResponse(text=full_response)

    def _complete_without_streaming(
        self, prompt: str, **kwargs: Any
    ) -> CompletionResponse:
        """Standard non-streaming API call"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": """You are a specialized AI assistant focused on providing comprehensive analysis of marketing and competitive data.

When analyzing marketing performance and trends:
1. Use the provided context whenever available for company-specific insights
2. When market trends aren't explicitly provided in the context, utilize your knowledge of current market trends, competitor positions, and industry standards
3. Always specify the source of your information - whether from the provided context or your general knowledge
4. Never claim you don't have access to market trends - use your knowledge of marketing principles and trends to provide value
5. Provide specific, actionable insights whenever possible
6. Clearly label when you're using general knowledge versus the specific data provided

Even when specific market data isn't provided, you should leverage your extensive knowledge of marketing principles, consumer behavior, and industry benchmarks to provide valuable insights.""",
                },
                {"role": "user", "content": prompt},
            ],
            # "max_tokens": self.num_output,
            "temperature": self.temperature,
        }

        try:
            response = requests.post(self.api_url, json=payload, headers=headers)
            response.raise_for_status()
            response_json = response.json()

            # Extract and store citations if available
            self.last_citations = response_json.get("citations", [])

            return CompletionResponse(
                text=response_json["choices"][0]["message"]["content"]
            )
        except Exception as e:
            self.last_citations = []  # Reset citations on error
            raise Exception(f"Error calling Perplexity API: {str(e)}")

    @llm_completion_callback()
    def stream_complete(self, prompt: str, **kwargs: Any) -> CompletionResponseGen:
        """Stream complete with thinking token extraction and logging"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": """You are a specialized AI assistant focused on providing comprehensive analysis of marketing and competitive data.

When analyzing marketing performance and trends:
1. Use the provided context whenever available for company-specific insights
2. When market trends aren't explicitly provided in the context, utilize your knowledge of current market trends, competitor positions, and industry standards
3. Always specify the source of your information - whether from the provided context or your general knowledge
4. Never claim you don't have access to market trends - use your knowledge of marketing principles and trends to provide value
5. Provide specific, actionable insights whenever possible
6. Clearly label when you're using general knowledge versus the specific data provided

Even when specific market data isn't provided, you should leverage your extensive knowledge of marketing principles, consumer behavior, and industry benchmarks to provide valuable insights.""",
                },
                {"role": "user", "content": prompt},
            ],
            # "max_tokens": self.num_output,
            "temperature": self.temperature,
            "stream": True,  # Enable streaming
        }

        try:
            response = requests.post(
                self.api_url, json=payload, headers=headers, stream=True
            )
            response.raise_for_status()

            # Process the streaming response
            accumulated_response = ""
            current_thinking = ""
            thinking_buffer = ""
            in_thinking_block = False

            # For building the complete response and extracting citations
            complete_response_json = {}

            for line in response.iter_lines():
                if not line:
                    continue

                # Skip the "data: " prefix and empty lines
                line = line.decode("utf-8")
                if not line.startswith("data: "):
                    continue

                # Remove the "data: " prefix
                json_str = line[6:]

                # Check for the stream end marker
                if json_str == "[DONE]":
                    break

                try:
                    # Parse the JSON content
                    chunk = json.loads(json_str)

                    # Add chunk data to our complete response
                    # This will gradually build up the full response including citations
                    for key, value in chunk.items():
                        complete_response_json[key] = value

                        # If we found citations, store them immediately
                        if key == "citations" and isinstance(value, list):
                            self.last_citations = value

                    # Get the delta content
                    delta_content = (
                        chunk.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )

                    if delta_content:
                        # Check for thinking tags
                        if "<think>" in delta_content and not in_thinking_block:
                            # Start of thinking block
                            in_thinking_block = True
                            thinking_start_idx = delta_content.find("<think>") + len(
                                "<think>"
                            )
                            thinking_content = delta_content[thinking_start_idx:]
                            current_thinking += thinking_content
                            thinking_buffer += thinking_content

                            # Log the start of thinking
                            print("\n--- PERPLEXITY THINKING STARTED ---")

                        elif "</think>" in delta_content and in_thinking_block:
                            # End of thinking block
                            thinking_end_idx = delta_content.find("</think>")
                            thinking_content = delta_content[:thinking_end_idx]
                            current_thinking += thinking_content
                            thinking_buffer += thinking_content

                            # Print any remaining buffered thinking content
                            if thinking_buffer:
                                print(thinking_buffer)
                                thinking_buffer = ""

                            in_thinking_block = False
                            print("--- PERPLEXITY THINKING COMPLETED ---\n")

                            # Reset for next thinking block
                            current_thinking = ""

                            # Add the content after </think> to the accumulated response
                            post_thinking_content = delta_content[
                                thinking_end_idx + len("</think>") :
                            ]
                            accumulated_response += post_thinking_content

                        elif in_thinking_block:
                            # Within thinking block - accumulate and print in logical chunks
                            current_thinking += delta_content
                            thinking_buffer += delta_content

                            # Print buffer contents when we have enough to make sense
                            # or when we hit sentence endings
                            if len(thinking_buffer) >= 50 or any(
                                ending in thinking_buffer
                                for ending in [". ", "! ", "? ", ".\n", "!\n", "?\n"]
                            ):
                                print(thinking_buffer, end="", flush=True)
                                thinking_buffer = ""

                        else:
                            # Regular content outside thinking blocks
                            accumulated_response += delta_content

                        # Yield the current accumulation for both thinking and non-thinking parts
                        # This gives the full output to the caller
                        yield CompletionResponse(
                            text=accumulated_response, delta=delta_content
                        )

                except json.JSONDecodeError:
                    print(f"Failed to parse JSON: {json_str}")
                    continue

            # Print any remaining thinking buffer content
            if thinking_buffer:
                print(thinking_buffer)

            # Final check for citations if we haven't found them yet
            if not self.last_citations and "citations" in complete_response_json:
                self.last_citations = complete_response_json["citations"]
                print(
                    f"Retrieved {len(self.last_citations)} citations from complete response"
                )

            # If we still don't have citations, check if they might be in the last message
            if not self.last_citations and "choices" in complete_response_json:
                for choice in complete_response_json.get("choices", []):
                    if "message" in choice and "citations" in choice["message"]:
                        self.last_citations = choice["message"]["citations"]
                        print(
                            f"Found {len(self.last_citations)} citations in final message"
                        )
                        break

            return

        except Exception as e:
            self.last_citations = []  # Reset citations on error
            print(f"Error in streaming call to Perplexity API: {str(e)}")
            raise Exception(f"Error calling Perplexity streaming API: {str(e)}")

    def get_last_citations(self) -> List[str]:
        """Return citations from the last API call"""
        return self.last_citations


class KnowledgeBase:
    def __init__(self):
        # Initialize connections using environment variables
        self.supabase = create_client(
            os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
            os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
            options=ClientOptions(
                postgrest_client_timeout=60,
                schema="public",
            ),
        )

        print("Initializing Knowledge Base with chunk-based retrieval...")
        start_time = time.time()

        # Initialize document cache
        self.document_cache = {}
        self.query_cache = {}
        self.cache_expiry = 3600  # Cache expiry in seconds (1 hour)

        # Topic chunk storage
        self.topic_chunks = {}
        self.keyword_index = {}
        self.doc_to_topic_map = {}
        self.topic_metadata = {}

        # Raw attribution data cache - new addition
        self.attribution_campaign_data = []
        self.attribution_channel_data = []

        # Initialize QA templates
        self.qa_templates = create_qa_templates(
            company_context=COMPANY_CONTEXT,
            company_name=COMPANY_CONTEXT.get("name", "Company"),
        )

        # Initialize the index and query engines
        self._initialize_index()

        # Pre-compute type filters
        self.type_filters = self._build_type_filters()

        # Preprocess documents into topical chunks for faster retrieval
        try:
            self._preprocess_documents_into_chunks()
            print(
                f"Knowledge base initialization completed in {time.time() - start_time:.2f} seconds"
            )
        except ImportError:
            print(
                "Warning: scikit-learn not installed. Falling back to standard retrieval."
            )
            print(
                "To use optimized chunk-based retrieval, install scikit-learn: pip install scikit-learn"
            )
        except Exception as e:
            print(
                f"Error during preprocessing: {str(e)}. Fallback to standard retrieval will be used."
            )
            # Initialize empty chunks to avoid errors
            self._initialize_empty_chunks()

    def _extract_keywords(self, text):
        """Extract important keywords from text using simple frequency analysis"""
        if not isinstance(text, str):
            # Handle non-string input
            return []

        # Convert to lowercase and split into words
        words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())

        # Remove common stop words
        stop_words = {
            "and",
            "the",
            "is",
            "in",
            "it",
            "to",
            "of",
            "for",
            "with",
            "on",
            "that",
            "this",
            "are",
            "as",
            "be",
            "by",
            "from",
            "has",
            "have",
            "not",
            "was",
            "were",
            "will",
            "an",
            "a",
        }
        filtered_words = [word for word in words if word not in stop_words]

        # Count occurrences
        word_counts = Counter(filtered_words)

        # Return top keywords (adjust number as needed)
        return [word for word, count in word_counts.most_common(20)]

    def _extract_keywords_from_query(self, query):
        """Extract keywords from a query"""
        # Simple approach - extract all significant words
        words = re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())
        stop_words = {
            "and",
            "the",
            "is",
            "in",
            "it",
            "to",
            "of",
            "for",
            "with",
            "on",
            "that",
            "this",
        }
        return [word for word in words if word not in stop_words]

    def _cluster_documents_by_topic(self, documents=None, num_topics=15):
        """Group documents into topics using K-means clustering on TF-IDF features"""
        if documents is None:
            documents = list(self.document_cache.values())

        # Check if we have enough documents
        if len(documents) < num_topics:
            num_topics = max(1, len(documents) // 2)
            print(
                f"Reducing number of topics to {num_topics} due to small document count"
            )

        if len(documents) == 0:
            print("No documents available for clustering")
            return {}

        print(f"Clustering {len(documents)} documents into topics...")
        start_time = time.time()

        # Extract document texts
        doc_texts = []
        doc_ids = []

        for doc_id, doc in self.document_cache.items():
            text = doc.get("text", "")
            if text and len(text.strip()) > 0:
                doc_texts.append(text)
                doc_ids.append(doc_id)

        if len(doc_texts) == 0:
            print("No valid document texts found for clustering")
            return {}

        # Create TF-IDF vectors
        try:
            vectorizer = TfidfVectorizer(
                max_features=1000, stop_words="english", ngram_range=(1, 2)
            )
            tfidf_matrix = vectorizer.fit_transform(doc_texts)

            # Apply K-means clustering
            kmeans = KMeans(n_clusters=num_topics, random_state=42)
            clusters = kmeans.fit_predict(tfidf_matrix)

            # Group documents by cluster
            topic_docs = defaultdict(list)
            for i, cluster_id in enumerate(clusters):
                # Use the document object
                doc_id = doc_ids[i]
                topic_docs[f"topic_{cluster_id}"].append(doc_id)
                # Map document ID to its topic
                self.doc_to_topic_map[doc_id] = f"topic_{cluster_id}"

            # Extract topic keywords
            feature_names = vectorizer.get_feature_names_out()
            for topic_id, doc_ids in topic_docs.items():
                # Get the centroid of this cluster
                centroid = kmeans.cluster_centers_[int(topic_id.split("_")[1])]
                # Get the top words for this topic
                top_keyword_indices = centroid.argsort()[-10:][::-1]
                top_keywords = [feature_names[i] for i in top_keyword_indices]

                # Store topic metadata
                self.topic_metadata[topic_id] = {
                    "keywords": top_keywords,
                    "size": len(doc_ids),
                    "docs": doc_ids,
                }

            print(
                f"Document clustering completed in {time.time() - start_time:.2f} seconds"
            )
            return topic_docs

        except Exception as e:
            print(f"Error during document clustering: {str(e)}")
            # Fallback: just create a single topic with all documents
            topic_docs = {"topic_0": doc_ids}
            self.topic_metadata["topic_0"] = {
                "keywords": ["general", "all", "documents"],
                "size": len(doc_ids),
                "docs": doc_ids,
            }

            # Map all documents to this topic
            for doc_id in doc_ids:
                self.doc_to_topic_map[doc_id] = "topic_0"

            return topic_docs

    def _format_topic_chunk(self, doc_ids, max_docs=10):
        """Format a set of documents into a coherent chunk with metadata"""
        # Limit number of documents to avoid context overflow
        if len(doc_ids) > max_docs:
            # Sort by some relevance metric and take top N
            # For simplicity, we'll just take the first N
            doc_ids = doc_ids[:max_docs]

        # Combine documents with headers
        chunk_parts = []
        for i, doc_id in enumerate(doc_ids):
            doc_info = self.document_cache.get(doc_id, {})
            doc_text = doc_info.get("text", "")
            doc_type = doc_info.get("type", "unknown")

            header = f"--- Document {i + 1} (Type: {doc_type}) ---"
            chunk_parts.append(f"{header}\n{doc_text}")

        return "\n\n".join(chunk_parts)

    def _preprocess_documents_into_chunks(self):
        """Organize documents into topic-based chunks for faster retrieval"""
        print("Preprocessing documents into topical chunks...")
        start_time = time.time()

        # Cluster documents by topic
        topic_docs = self._cluster_documents_by_topic()

        # Create content chunks for each topic
        for topic_id, doc_ids in topic_docs.items():
            chunk_text = self._format_topic_chunk(doc_ids)

            # Get keywords for this topic
            keywords = self.topic_metadata[topic_id]["keywords"]

            # Store the chunk
            self.topic_chunks[topic_id] = {
                "text": chunk_text,
                "document_ids": doc_ids,
                "keywords": keywords,
            }

            # Update keyword index for fast lookup
            for keyword in keywords:
                if keyword not in self.keyword_index:
                    self.keyword_index[keyword] = []
                self.keyword_index[keyword].append(topic_id)

        print(
            f"Created {len(self.topic_chunks)} topic chunks with {len(self.keyword_index)} indexed keywords"
        )
        print(f"Preprocessing completed in {time.time() - start_time:.2f} seconds")

    def _retrieve_relevant_chunks(self, query, max_chunks=3):
        """Retrieve the most relevant topic chunks for a query without vector search"""
        start_time = time.time()

        # Extract keywords from query
        query_keywords = self._extract_keywords_from_query(query)

        # Find matching topics based on keyword overlap
        topics_scores = defaultdict(int)

        # Score each topic based on keyword matches
        for keyword in query_keywords:
            for topic_id in self.keyword_index.get(keyword, []):
                topics_scores[topic_id] += 1

        # If no matches through keywords, use a simple fallback
        if not topics_scores:
            print("No keyword matches found, using fallback retrieval")
            # Return a few diverse topics as fallback
            fallback_chunks = []
            fallback_sources = []

            # Get a few random topics
            for topic_id in list(self.topic_chunks.keys())[:max_chunks]:
                fallback_chunks.append(self.topic_chunks[topic_id]["text"])

                # Add sources from these chunks
                doc_ids = self.topic_chunks[topic_id]["document_ids"][:5]
                for doc_id in doc_ids:
                    doc_info = self.document_cache.get(doc_id, {})
                    if doc_info:
                        fallback_sources.append(
                            {
                                "text": doc_info.get("text", ""),
                                "score": 0.5,  # Default score for fallback
                                "extra_info": {
                                    "type": doc_info.get("type", "unknown"),
                                    "id": doc_id,
                                    "url": doc_info.get("metadata", {}).get("url", ""),
                                    "image_url": doc_info.get("metadata", {}).get(
                                        "image_url", ""
                                    ),
                                },
                            }
                        )

            return fallback_chunks, fallback_sources

        # Get top scoring topics
        top_topics = sorted(
            topics_scores.keys(), key=lambda t: topics_scores[t], reverse=True
        )[:max_chunks]

        # Get the chunks for these topics
        chunks = [self.topic_chunks[topic_id]["text"] for topic_id in top_topics]

        # Get the document metadata for these chunks
        doc_ids = []
        for topic_id in top_topics:
            doc_ids.extend(self.topic_chunks[topic_id]["document_ids"])

        # Prepare source information
        sources = []
        for doc_id in doc_ids[:20]:  # Limit to 20 sources
            doc_info = self.document_cache.get(doc_id, {})
            if doc_info:
                sources.append(
                    {
                        "text": doc_info.get("text", ""),
                        "score": topics_scores.get(
                            self.doc_to_topic_map.get(doc_id, ""), 0.5
                        ),
                        "extra_info": {
                            "type": doc_info.get("type", "unknown"),
                            "id": doc_id,
                            "url": doc_info.get("metadata", {}).get("url", ""),
                            "image_url": doc_info.get("metadata", {}).get(
                                "image_url", ""
                            ),
                        },
                    }
                )

        print(f"Chunk retrieval completed in {time.time() - start_time:.2f} seconds")
        return chunks, sources

    def _build_type_filters(self) -> Dict[str, List[str]]:
        """Build document type filters for faster filtering during retrieval"""
        # Scan all documents for their IDs by type
        type_filters = {
            "ad": [],
            "market_research": [],
            "citation": [],
            "attribution_campaign": [],  # Add attribution campaign filter
            "attribution_channel": [],  # Add attribution channel filter
        }
        for doc_id, doc_info in self.document_cache.items():
            doc_type = doc_info.get("type")
            if doc_type in type_filters:
                type_filters[doc_type].append(doc_id)
        return type_filters

    def _fetch_all_data(self, supabase: Client) -> List[Document]:
        """Fetch all relevant data from Supabase and convert to Documents"""
        start_time = time.time()
        print("Fetching data from Supabase...")

        # Initialize separate document lists for each type
        library_documents = []
        research_documents = []
        feature_documents = []
        attribution_documents = []  # New list for attribution documents

        # 1. Fetch library items (visual content analysis)
        print("Fetching library items (visual content)...")
        library_items = supabase.table("library_items").select("*").execute().data
        for item in library_items:
            # Only include essential features and tones
            features_str = ""
            if item["features"] and len(item["features"]) > 0:
                # Take only top 3 features
                top_features = item["features"][:3]
                features_str = f"F:{','.join(top_features)}"

            sentiment_str = ""
            if item["sentiment_tones"] and len(item["sentiment_tones"]) > 0:
                # Take only top 2 tones
                top_tones = item["sentiment_tones"][:2]
                sentiment_str = f"T:{','.join(top_tones)}"
                if item["avg_sentiment_confidence"]:
                    sentiment_str += f"({item['avg_sentiment_confidence']:.1f})"

            # Create minimal document text
            desc = item["description"] or ""
            if len(desc) > 100:  # Truncate long descriptions
                desc = desc[:100] + "..."

            item_text = f"""{item["type"]}|{item["name"] or ""}
{desc}
{features_str}
{sentiment_str}"""

            doc = Document(
                text=item_text,
                extra_info={
                    "type": "visual",
                    "id": item["id"],
                    "url": item["preview_url"],
                },
            )
            library_documents.append(doc)

            # Minimal cache metadata
            self.document_cache[item["id"]] = {
                "type": "visual",
                "text": item_text,
            }

        # 2. Fetch market research data (audience and competitive insights)
        print("Fetching market research data (audience insights)...")
        research_data = supabase.table("market_research_v2").select("*").execute().data
        for research in research_data:
            # Create compact text representation without large JSON dumps
            target_audience = ""
            if research["target_audience"]:
                if isinstance(research["target_audience"], dict):
                    # Extract just the key demographics
                    demo = research["target_audience"].get("demographics", {})
                    if demo:
                        target_audience = f"Demographics: {', '.join(demo.keys())}"
                elif isinstance(research["target_audience"], list):
                    # Handle case where list items might be dictionaries
                    audience_items = []
                    for item in research["target_audience"][:3]:
                        if isinstance(item, dict):
                            # Take the first key or value from the dict as a string
                            dict_keys = list(item.keys())
                            if dict_keys:
                                audience_items.append(str(dict_keys[0]))
                        elif isinstance(item, str):
                            audience_items.append(item)
                        else:
                            # For any other type, convert to string
                            audience_items.append(str(item))

                    if audience_items:
                        target_audience = f"Target: {', '.join(audience_items)}"

            # Extract main pain points without full JSON
            pain_points = ""
            if research["pain_points"] and isinstance(research["pain_points"], dict):
                pain_points = (
                    f"Pain: {', '.join(list(research['pain_points'].keys())[:3])}"
                )

            # Create compact document
            research_text = f"""MR: {research["intent_summary"][:150]}
{target_audience}
{pain_points}"""

            doc = Document(
                text=research_text,
                extra_info={"type": "market_research", "id": research["id"]},
            )
            research_documents.append(doc)
            self.document_cache[research["id"]] = {
                "type": "market_research",
                "text": research_text,
            }

        # 3. Fetch feature performance metrics (analytics and insights)
        print("Fetching feature performance metrics...")
        feature_metrics = (
            supabase.table("feature_metrics_summary").select("*").execute().data
        )
        for metric in feature_metrics:
            if not metric["unique_feature"]:
                continue

            # Create compact performance metrics text
            perf_text = []
            if metric["avg_ctr"] is not None:
                perf_text.append(f"CTR:{metric['avg_ctr']:.1%}")
            if metric["avg_conversions"] is not None:
                perf_text.append(f"Conv:{metric['avg_conversions']:.1f}")
            if metric["avg_roas"] is not None:
                perf_text.append(f"ROAS:{metric['avg_roas']:.1f}x")

            # Limit categories and locations to top 2
            top_cats = ""
            if metric["categories_ranked"]:
                top_cats = f"Cat:{','.join(metric['categories_ranked'][:2])}"

            top_locs = ""
            if metric["locations_ranked"]:
                top_locs = f"Loc:{','.join(metric['locations_ranked'][:2])}"

            # Create minimal document text
            feature_text = f"""F: {metric["unique_feature"]}
{" | ".join(perf_text)}
{top_cats}
{top_locs}"""

            doc = Document(
                text=feature_text,
                extra_info={
                    "type": "feature_performance",
                    "feature": metric["unique_feature"],
                },
            )
            feature_documents.append(doc)
            self.document_cache[metric["unique_feature"]] = {
                "type": "feature_performance",
                "text": feature_text,
            }

        # 4. Fetch enhanced attribution metrics (new section)
        print("Fetching enhanced attribution metrics...")
        # Fetch campaign metrics
        try:
            campaign_metrics = (
                supabase.table("enhanced_ad_metrics_by_campaign")
                .select("*")
                .execute()
                .data
            )
            # Store raw data in our cache for direct access later
            self.attribution_campaign_data = campaign_metrics

            print(f"Fetched {len(campaign_metrics)} campaign metrics records")

            for metric in campaign_metrics:
                if not metric["campaign_id"]:
                    continue

                # Create attribution metrics text with type marker for easier filtering
                metric_text = f"""TYPE: attribution_campaign
Campaign Attribution: {metric["campaign_id"]}
CTR: {metric["avg_ctr"] if metric["avg_ctr"] is not None else "N/A"}
Conv Rate: {metric["avg_conversion_rate"] if metric["avg_conversion_rate"] is not None else "N/A"}
ROAS: {metric["avg_roas"] if metric["avg_roas"] is not None else "N/A"}
Cost/Conv: {metric["cost_per_conversion"] if metric["cost_per_conversion"] is not None else "N/A"}
Clicks: {metric["total_clicks"] if metric["total_clicks"] is not None else "N/A"}
Impressions: {metric["total_impressions"] if metric["total_impressions"] is not None else "N/A"}
Conversions: {metric["total_conversions"] if metric["total_conversions"] is not None else "N/A"}
Total Cost: {metric["total_cost"] if metric["total_cost"] is not None else "N/A"}
Ad Description: {metric["ad_description"] if metric["ad_description"] is not None else "N/A"}"""
                
                doc = Document(
                    text=metric_text,
                    extra_info={
                        "type": "attribution_campaign",
                        "id": metric["campaign_id"],  # Use campaign_id directly as id
                        "raw_data": metric,
                    },
                )
                attribution_documents.append(doc)
                self.document_cache[metric["campaign_id"]] = {  # Store without prefix
                    "type": "attribution_campaign",
                    "text": metric_text,
                    "data": metric,
                }

            # Add campaign metrics document to directly ensure they're findable
            all_campaigns_doc = Document(
                text=f"""TYPE: attribution_campaign_summary
Attribution Data for All Campaigns
Total campaigns analyzed: {len(campaign_metrics)}
Metrics available: CTR, Conversion Rate, ROAS, Cost/Conversion, Clicks, Impressions, Conversions, Total Cost
This document contains aggregated campaign performance data for attribution analysis.""",
                extra_info={"type": "attribution_campaign_summary"},
            )
            attribution_documents.append(all_campaigns_doc)
        except Exception as e:
            print(f"Error fetching campaign metrics: {str(e)}")

        # Fetch channel metrics
        try:
            channel_metrics = (
                supabase.table("enhanced_ad_metrics_by_channel")
                .select("*")
                .execute()
                .data
            )
            # Store raw data in our cache for direct access later
            self.attribution_channel_data = channel_metrics

            print(f"Fetched {len(channel_metrics)} channel metrics records")

            for metric in channel_metrics:
                if not metric["channel"]:
                    continue

                # Create channel attribution metrics text with type marker for easier filtering
                metric_text = f"""TYPE: attribution_channel
Channel Attribution: {metric["channel"]} ({metric["date"] or "All time"})
CTR: {metric["avg_ctr"] if metric["avg_ctr"] is not None else "N/A"}
CPC: {metric["avg_cpc"] if metric["avg_cpc"] is not None else "N/A"}
CPM: {metric["avg_cpm"] if metric["avg_cpm"] is not None else "N/A"}
Conv Rate: {metric["avg_conversion_rate"] if metric["avg_conversion_rate"] is not None else "N/A"}
Clicks: {metric["total_clicks"] if metric["total_clicks"] is not None else "N/A"}
Impressions: {metric["total_impressions"] if metric["total_impressions"] is not None else "N/A"}
Conversions: {metric["total_conversions"] if metric["total_conversions"] is not None else "N/A"}
Total Cost: {metric["total_cost"] if metric["total_cost"] is not None else "N/A"}"""

                # Create a unique ID that combines channel and date
                channel_id = f"{metric['channel']}_{metric['date']}"

                doc = Document(
                    text=metric_text,
                    extra_info={
                        "type": "attribution_channel",
                        "id": channel_id,  # Use combined ID directly
                        "raw_data": metric,
                    },
                )
                attribution_documents.append(doc)
                self.document_cache[channel_id] = {  # Store without prefix
                    "type": "attribution_channel",
                    "text": metric_text,
                    "data": metric,
                }

            # Add channel metrics document to directly ensure they're findable
            all_channels_doc = Document(
                text=f"""TYPE: attribution_channel_summary
Attribution Data for All Channels
Total channels analyzed: {len(set(m["channel"] for m in channel_metrics if m["channel"]))}
Metrics available: CTR, CPC, CPM, Conversion Rate, Clicks, Impressions, Conversions, Total Cost
This document contains aggregated channel performance data for attribution analysis.""",
                extra_info={"type": "attribution_channel_summary"},
            )
            attribution_documents.append(all_channels_doc)
        except Exception as e:
            print(f"Error fetching channel metrics: {str(e)}")

        # Ensure type filters are updated to use the new IDs
        self.type_filters = {
            "ad": [],
            "market_research": [],
            "citation": [],
            "attribution_campaign": [],
            "attribution_channel": [],
        }
        for doc_id, doc_info in self.document_cache.items():
            doc_type = doc_info.get("type")
            if doc_type in self.type_filters:
                self.type_filters[doc_type].append(doc_id)

        # Add attribution context document
        attribution_context = """ATTRIBUTION DATA ANALYSIS
These documents contain detailed campaign and channel attribution metrics including:
- Campaign performance with CTR, conversion rate, ROAS metrics
- Channel performance across different time periods
- Cost metrics including CPC, CPM, and cost per conversion
- Volume metrics including clicks, impressions, and conversions
This data is ideal for analyzing marketing performance and ROI across campaigns and channels."""

        # Add type-specific context to each document list
        visual_context = """VISUAL CONTENT ANALYSIS DOCUMENTS
These documents contain analysis of visual content (images/videos) including:
- Visual features and their locations in the content
- Sentiment analysis and confidence scores
- Content type (image/video) and descriptive metadata"""

        research_context = """MARKET RESEARCH AND AUDIENCE ANALYSIS DOCUMENTS
These documents contain market and audience insights including:
- Target audience demographics and behaviors
- Customer pain points and needs
- Competitive analysis and advantages
- Market positioning and strategic insights"""

        performance_context = """FEATURE PERFORMANCE ANALYTICS DOCUMENTS
These documents contain performance metrics for specific features including:
- Engagement metrics (clicks, impressions, CTR)
- Conversion metrics and ROAS
- Best performing categories and locations
- Related content references"""

        # Combine all documents with their context
        all_documents = []
        if library_documents:
            all_documents.append(Document(text=visual_context))
            all_documents.extend(library_documents)
        if research_documents:
            all_documents.append(Document(text=research_context))
            all_documents.extend(research_documents)
        if feature_documents:
            all_documents.append(Document(text=performance_context))
            all_documents.extend(feature_documents)
        if attribution_documents:
            all_documents.append(Document(text=attribution_context))
            all_documents.extend(attribution_documents)

        print(f"Data fetching completed in {time.time() - start_time:.2f} seconds.")
        print(f"Total documents by type:")
        print(f"- Visual Content Analysis: {len(library_documents)}")
        print(f"- Market Research: {len(research_documents)}")
        print(f"- Feature Performance: {len(feature_documents)}")
        print(f"- Attribution Data: {len(attribution_documents)}")

        return all_documents

    def _initialize_index(self):
        """Initialize the vector store and index, LLMs, and query engines"""
        print("Fetching and processing documents...")
        documents = self._fetch_all_data(self.supabase)

        # Create separate indices for each document type to avoid metadata overflow
        print("Creating separate indices for each document type...")

        # Get document counts
        library_count = sum(
            1
            for doc in documents
            if "VISUAL CONTENT ANALYSIS" in doc.text
            or doc.extra_info.get("type") == "visual"
        )
        research_count = sum(
            1
            for doc in documents
            if "MARKET RESEARCH" in doc.text
            or doc.extra_info.get("type") == "market_research"
        )
        feature_count = sum(
            1
            for doc in documents
            if "FEATURE PERFORMANCE" in doc.text
            or doc.extra_info.get("type") == "feature_performance"
        )

        print(f"Processing {library_count} visual content documents...")
        print(f"Processing {research_count} market research documents...")
        print(f"Processing {feature_count} feature performance documents...")

        # Simplify documents before indexing by creating new lightweight documents
        simplified_documents = []

        for doc in documents:
            # Preserve the text but minimize extra_info
            simple_doc = Document(
                text=doc.text,
                # Keep only essential metadata
                extra_info={"type": doc.extra_info.get("type", "unknown")},
            )
            simplified_documents.append(simple_doc)

        # Set up the vector store
        vector_store = SupabaseVectorStore(
            postgres_connection_string=os.getenv("DB_CONNECTION"),
            collection_name="library_items",
        )
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        # Use text splitter that doesn't rely on metadata
        from llama_index.core.node_parser import SentenceSplitter

        # Configure settings for indexing
        Settings.chunk_size = 4096  # Use larger chunks
        Settings.chunk_overlap = 50

        # Create the index with the custom text splitter
        print("Creating vector index with simplified documents...")
        self.index = VectorStoreIndex.from_documents(
            simplified_documents,
            storage_context=storage_context,
            transformations=[SentenceSplitter(chunk_size=4096, chunk_overlap=50)],
        )

        # Initialize Perplexity LLM for standard queries
        self.perplexity_llm = PerplexityLLM(model="sonar-pro", temperature=0.1)
        Settings.llm = self.perplexity_llm
        Settings.context_window = 4096
        Settings.num_output = 1024

        # Create extended context for other methods
        self.company_context = f"""You are an AI assistant for {COMPANY_CONTEXT.get("name", "Company")}, 
        focusing on our company's specific context and strategic priorities.
        
        Key Company Context:
        - Industry: {COMPANY_CONTEXT.get("industry", "Not specified")}
        - Core Products: {", ".join(COMPANY_CONTEXT.get("core_business", {}).get("primary_products", ["Not specified"]))}
        - Key Markets: {", ".join(COMPANY_CONTEXT.get("core_business", {}).get("key_markets", ["Not specified"]))}
        - Target Segments: {", ".join(COMPANY_CONTEXT.get("core_business", {}).get("target_segments", ["Not specified"]))}
        
        Strategic Focus Areas:
        {self._format_strategic_priorities()}
        
        Market Position:
        - Competitive Advantages: {", ".join(COMPANY_CONTEXT.get("market_position", {}).get("competitive_advantages", ["Not specified"]))}
        - Key Competitors: {self._format_competitors()}
        - Current Market Trends: {", ".join(COMPANY_CONTEXT.get("market_position", {}).get("market_trends", {}).get("consumer_preferences", ["Not specified"]))}
        
        Current Challenges:
        {self._format_challenges()}
        """

    @lru_cache(maxsize=100)
    def _get_cached_query_result(self, query_key: str) -> Optional[Dict[str, Any]]:
        """Get cached query result if it exists and is not expired"""
        if query_key in self.query_cache:
            result, timestamp = self.query_cache[query_key]
            if time.time() - timestamp < self.cache_expiry:
                return result
            else:
                # Remove expired cache entry
                del self.query_cache[query_key]
        return None

    def _fast_retrieval(
        self, query: str, top_k: int = 20, types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Optimized retrieval function that uses pre-filters and direct vector operations"""
        start_time = time.time()

        # First try from cache
        cache_key = f"{query}_{top_k}_{types}"
        cached_result = self._get_cached_query_result(cache_key)
        if cached_result:
            print(f"Cache hit for query: {query[:30]}...")
            return cached_result

        # Special case for attribution data - use the directly cached data
        if types and (
            "attribution_campaign" in types or "attribution_channel" in types
        ):
            print(f"Using direct attribution data retrieval for types: {types}")
            results = []

            # If requesting campaign attribution, add campaign metrics
            if "attribution_campaign" in types and self.attribution_campaign_data:
                print(
                    f"Adding {len(self.attribution_campaign_data)} campaign metrics to results"
                )
                for metric in self.attribution_campaign_data:
                    # Create a result entry for each campaign metric
                    text = f"""Campaign Attribution: {metric["campaign_id"]}
CTR: {metric["avg_ctr"] if metric["avg_ctr"] is not None else "N/A"}
Conv Rate: {metric["avg_conversion_rate"] if metric["avg_conversion_rate"] is not None else "N/A"}
ROAS: {metric["avg_roas"] if metric["avg_roas"] is not None else "N/A"}
Cost/Conv: {metric["cost_per_conversion"] if metric["cost_per_conversion"] is not None else "N/A"}
Clicks: {metric["total_clicks"] if metric["total_clicks"] is not None else "N/A"}
Impressions: {metric["total_impressions"] if metric["total_impressions"] is not None else "N/A"}
Conversions: {metric["total_conversions"] if metric["total_conversions"] is not None else "N/A"}
Total Cost: {metric["total_cost"] if metric["total_cost"] is not None else "N/A"}"""

                    results.append(
                        {
                            "text": text,
                            "score": 0.95,  # High score since this is direct data
                            "extra_info": {
                                "type": "attribution_campaign",
                                "id": metric["campaign_id"],
                                "raw_data": metric,
                                "ad_id": metric["ad_id"],
                                "image_url": metric["image_url"],
                            },
                        }
                    )

            # If requesting channel attribution, add channel metrics
            if "attribution_channel" in types and self.attribution_channel_data:
                print(
                    f"Adding {len(self.attribution_channel_data)} channel metrics to results"
                )
                for metric in self.attribution_channel_data:
                    # Create a result entry for each channel metric
                    text = f"""Channel Attribution: {metric["channel"]} ({metric["date"] or "All time"})
CTR: {metric["avg_ctr"] if metric["avg_ctr"] is not None else "N/A"}
CPC: {metric["avg_cpc"] if metric["avg_cpc"] is not None else "N/A"}
CPM: {metric["avg_cpm"] if metric["avg_cpm"] is not None else "N/A"}
Conv Rate: {metric["avg_conversion_rate"] if metric["avg_conversion_rate"] is not None else "N/A"}
Clicks: {metric["total_clicks"] if metric["total_clicks"] is not None else "N/A"}
Impressions: {metric["total_impressions"] if metric["total_impressions"] is not None else "N/A"}
Conversions: {metric["total_conversions"] if metric["total_conversions"] is not None else "N/A"}
Total Cost: {metric["total_cost"] if metric["total_cost"] is not None else "N/A"}"""

                    results.append(
                        {
                            "text": text,
                            "score": 0.95,  # High score since this is direct data
                            "extra_info": {
                                "type": "attribution_channel",
                                "id": f"{metric['channel']}_{metric['date']}",
                                "raw_data": metric,
                            },
                        }
                    )

            # If we have direct results, return them
            if results:
                # Sort by relevance (if we had a way to determine query relevance)
                results = results[:top_k]
                self.query_cache[cache_key] = (results, time.time())
                print(
                    f"Direct attribution retrieval completed in {time.time() - start_time:.2f} seconds. Retrieved {len(results)} records."
                )
                return results
            else:
                print("No direct attribution data found, falling back to vector search")

        # Get raw retriever for faster direct operations
        retriever = self.index.as_retriever(
            similarity_top_k=top_k * 3 if types else top_k
        )  # Get more results if filtering

        # Retrieve nodes first without any filtering
        nodes = retriever.retrieve(query)

        # Apply type filtering after retrieval if specified
        if types:
            print(f"Filtering results for types: {types}")
            # Use type filters to get document IDs of specified types
            filtered_ids = []
            for doc_type in types:
                filtered_ids.extend(self.type_filters.get(doc_type, []))

            # Filter nodes manually after retrieval if we have type filters
            if filtered_ids:
                # Instead of looking for 'id' directly, check the text content
                # and metadata for matches with our filtered IDs
                filtered_nodes = []

                for node in nodes:
                    # Check if the node's text content contains any of our target IDs
                    node_text = node.node.text if hasattr(node.node, "text") else ""

                    # Check if extra_info contains our type
                    node_type = None
                    if hasattr(node.node, "extra_info") and isinstance(
                        node.node.extra_info, dict
                    ):
                        node_type = node.node.extra_info.get("type")

                    # Add node if it matches any of our filtered types
                    if node_type in types:
                        filtered_nodes.append(node)
                        continue

                    # Check for the TYPE: marker we added in the text
                    if any(f"TYPE: {t}" in node_text for t in types):
                        filtered_nodes.append(node)
                        continue

                    # Check if the text contains any of our target IDs or type keywords
                    if any(f_id in node_text for f_id in filtered_ids):
                        filtered_nodes.append(node)
                        continue

                    # Try one more check - look for attribution keywords in the text
                    if any(t in node_text.lower() for t in types):
                        filtered_nodes.append(node)

                # If filtering gave us results, use them; otherwise fall back to all nodes
                if filtered_nodes:
                    print(
                        f"Filtered from {len(nodes)} to {len(filtered_nodes)} nodes based on type"
                    )
                    nodes = filtered_nodes
            else:
                print(f"No nodes matched the type filters, falling back to all results")

        # Sort by relevance and limit to top_k
        nodes = sorted(nodes, key=lambda x: x.score, reverse=True)[:top_k]

        # Convert to lightweight format
        results = []
        for node in nodes:
            # Extract extra_info safely
            extra_info = {}
            if hasattr(node.node, "extra_info") and node.node.extra_info:
                extra_info = node.node.extra_info

            results.append(
                {
                    "text": node.node.text
                    if hasattr(node.node, "text")
                    else str(node.node),
                    "score": float(node.score),
                    "extra_info": extra_info,
                }
            )

        # Cache result
        self.query_cache[cache_key] = (results, time.time())

        print(
            f"Fast retrieval completed in {time.time() - start_time:.2f} seconds. Retrieved {len(results)} documents."
        )
        return results

    def _fast_query_engine(self, query: str, detail_level: int = 50) -> Dict[str, Any]:
        """A faster query engine that uses pre-processed chunks with vector search fallback"""
        start_time = time.time()
        retrieval_method = "chunk"  # Default to chunk-based retrieval

        # Step 1: Retrieve relevant chunks using keyword-based lookup
        max_chunks = 1  # Start with 1 chunk for lower detail levels
        if detail_level > 60:
            max_chunks = 2  # Use 2 chunks for medium detail
        if detail_level > 80:
            max_chunks = 3  # Use 3 chunks for high detail

        # Choose LLM model based on detail level
        if detail_level < 50:
            self.perplexity_llm.model = "sonar-pro"
        else:
            self.perplexity_llm.model = "sonar-reasoning-pro"
            print(
                "Using reasoning model for detailed analysis (will show chain-of-thought)"
            )

        # Get template based on detail level
        if detail_level < 50:
            template = self.qa_templates["compact"]
        elif detail_level < 85:
            template = self.qa_templates["standard"]
        else:
            template = self.qa_templates["comprehensive"]

        # Try using chunk-based retrieval first
        try:
            if len(self.topic_chunks) > 0:
                print("Retrieving relevant ad campaigns and market research...")
                chunks, sources = self._retrieve_relevant_chunks(
                    query, max_chunks=max_chunks
                )

                # Check if we got meaningful results
                if not chunks or chunks[0].startswith(
                    "No preprocessed chunks available"
                ):
                    raise ValueError("No relevant ad campaigns found in database")
            else:
                raise ValueError("Ad campaign database not initialized")
        except Exception as e:
            # Fall back to vector search if chunk retrieval fails
            print(
                f"Chunk retrieval failed: {str(e)}. Falling back to comprehensive search."
            )
            top_k = int(min(20 + (detail_level / 200) * 80, 100))  # Use fewer documents
            print("Searching through complete ad and market research database...")
            sources = self._fast_retrieval(query, top_k)

            # Format sources as context
            chunks = [
                "\n\n".join(
                    [
                        f"Campaign/Research Entry {i + 1} (Relevance: {source['score']:.2f}):\n{source['text']}"
                        for i, source in enumerate(sources[:top_k])
                    ]
                )
            ]
            retrieval_method = "vector"

        retrieval_time = time.time() - start_time
        print(
            f"Retrieved {len(sources)} relevant campaigns/research entries in {retrieval_time:.2f} seconds using {retrieval_method} search"
        )
        llm_start = time.time()

        # Step 2: Format context for the LLM
        context_text = "\n\n".join(chunks)

        # Summarize context if it's too large
        if len(context_text.split()) > 2000 and detail_level < 70:
            # Truncate context for lower detail levels
            context_text = "\n\n".join(chunks[:1])
            print(
                f"Focusing on most relevant {len(context_text.split())} words of campaign data"
            )

        # Step 3: Generate response using the template and chunks
        print("Analyzing campaign data and generating insights...")
        prompt = template.format(query_str=query, context_str=context_text)

        # Get response from LLM
        if "reasoning" in self.perplexity_llm.model:
            print("Using streaming for chain-of-thought capture...")
            # Use streaming to capture thinking, but get final response
            response = self.perplexity_llm.complete(prompt)
        else:
            # Standard non-streaming for regular models
            response = self.perplexity_llm.complete(prompt)

        llm_time = time.time() - llm_start
        print(f"Analysis completed in {llm_time:.2f} seconds")

        return {
            "response": response.text,
            "sources": sources,
            "citations": self.perplexity_llm.get_last_citations(),
            "timing": {
                "retrieval_time": retrieval_time,
                "llm_time": llm_time,
                "total_time": time.time() - start_time,
                "method": retrieval_method,
            },
        }

    async def query(
        self,
        query: str,
        deep_research: bool = False,  # Parameter kept for backward compatibility
        detail_level: int = 50,
        attribution_analysis: bool = False,
    ) -> dict:
        """Enhanced query method that supports attribution analysis"""
        attribution_data = None

        # Check if query contains attribution-related terms
        attribution_keywords = [
            "attribution",
            "campaign performance",
            "channel performance",
            "roas",
            "roi",
            "conversion rate",
            "ctr",
            "cpc",
            "cpm",
            "which campaigns",
            "which channels",
            "best performing",
            "campaign metrics",
            "marketing performance",
            "ad spend",
            "visual features",  # Added visual feature related keywords
            "feature performance",
            "visual elements",
            "best categories",
            "top locations",
        ]

        has_attribution_terms = any(
            keyword in query.lower() for keyword in attribution_keywords
        )

        # If attribution analysis is explicitly requested or the query contains attribution terms
        if attribution_analysis or has_attribution_terms:
            attribution_data = self.get_attribution_data(query)

            # Use the optimized fast query engine (always use this implementation now)
            print(f"Processing query with detail level {detail_level}: {query}")
            result = self._fast_query_engine(query, detail_level)

        # Add attribution data to the result if available
        response_text = result["response"]

        # If we have attribution data, extend the response with specific attribution insights
        if attribution_data:
            # Prepare an enhanced response with attribution data
            attribution_section = f"""

ATTRIBUTION ANALYSIS:
{attribution_data.attribution_insights}

Top Performing Campaigns:
{self._format_top_performers(attribution_data.top_performing_campaigns, "campaign")}

Top Performing Channels:
{self._format_top_performers(attribution_data.top_performing_channels, "channel")}

Top Performing Visual Features:
{self._format_top_features(attribution_data.top_performing_features)}

{attribution_data.feature_category_analysis}

{attribution_data.feature_location_analysis}
"""
            # Add attribution section to the response
            response_text += attribution_section

            return {
                "response": response_text,
                "sources": result["sources"],
                "citations": result["citations"],
                "attribution_data": attribution_data.dict()
                if attribution_data
                else None,
                "metadata": {
                    "detail_level": detail_level,
                    "retrieval_time": result["timing"]["retrieval_time"],
                    "llm_time": result["timing"]["llm_time"],
                    "total_time": result["timing"]["total_time"],
                    "llm_model": self.perplexity_llm.model,
                    "has_attribution_data": attribution_data is not None,
                    "deep_research": deep_research,  # Keep for consistency but it doesn't change behavior now
                },
            }

    def _format_top_performers(self, performers, performer_type):
        """Format top performers data for readable output"""
        if not performers:
            return "No data available"

        lines = []
        for idx, item in enumerate(performers):
            if performer_type == "campaign":
                lines.append(
                    f"{idx + 1}. Campaign: {item.get('campaign_id', 'Unknown')}"
                )
                lines.append(f"   ROAS: {item.get('avg_roas', 'N/A')}")
                lines.append(f"   Conv Rate: {item.get('avg_conversion_rate', 'N/A')}")
                lines.append(f"   CTR: {item.get('avg_ctr', 'N/A')}")
                lines.append(f"   Cost/Conv: ${item.get('cost_per_conversion', 'N/A')}")
                lines.append("")
            else:  # channel
                lines.append(f"{idx + 1}. Channel: {item.get('channel', 'Unknown')}")
                lines.append(f"   CTR: {item.get('avg_ctr', 'N/A')}")
                lines.append(f"   CPC: ${item.get('avg_cpc', 'N/A')}")
                lines.append(f"   CPM: ${item.get('avg_cpm', 'N/A')}")
                lines.append(f"   Conv Rate: {item.get('avg_conversion_rate', 'N/A')}")
                lines.append("")

        return "\n".join(lines)

    def _format_top_features(self, features):
        """Format top performing visual features for readable output"""
        if not features:
            return "No visual feature data available"

        lines = []
        lines.append(
            "The following visual features have the highest performance metrics:"
        )
        lines.append("")

        for idx, item in enumerate(features):
            feature_name = item.get("unique_feature", "Unknown")
            lines.append(f"{idx + 1}. Feature: {feature_name}")
            lines.append(f"   ROAS: {item.get('avg_roas', 'N/A')}")
            lines.append(f"   CTR: {item.get('avg_ctr', 'N/A')}")

            # Add category information if available
            if item.get("categories_ranked"):
                top_cats = ", ".join(item.get("categories_ranked", [])[:3])
                lines.append(f"   Top Categories: {top_cats}")

            # Add location information if available
            if item.get("locations_ranked"):
                top_locs = ", ".join(item.get("locations_ranked", [])[:3])
                lines.append(f"   Top Locations: {top_locs}")

            lines.append("")

        return "\n".join(lines)

    def get_attribution_data(self, query: str) -> AttributionData:
        """Fetch and analyze attribution data for a specific query"""
        print("Analyzing attribution data...")
        start_time = time.time()

        # Use direct data access instead of retrieval if we have cached data
        campaign_metrics = []
        channel_metrics = []
        feature_metrics = []  # New variable for feature metrics

        # If we have direct access to the data, use it
        if self.attribution_campaign_data:
            print(
                f"Using {len(self.attribution_campaign_data)} cached campaign metrics"
            )
            campaign_metrics = self.attribution_campaign_data
        else:
            # Fallback to retrieval
            campaign_docs = self._fast_retrieval(
                query, top_k=20, types=["attribution_campaign"]
            )
            print(f"Retrieved {len(campaign_docs)} campaign docs")
            # Extract raw data
            for doc in campaign_docs:
                if "raw_data" in doc.get("extra_info", {}):
                    campaign_metrics.append(doc["extra_info"]["raw_data"])
                elif doc_id := doc["extra_info"].get("id"):
                    # Try to get from cache
                    cache_entry = self.document_cache.get(f"campaign_{doc_id}")
                    if cache_entry and "data" in cache_entry:
                        campaign_metrics.append(cache_entry["data"])

        # Use direct data for channels too
        if self.attribution_channel_data:
            print(f"Using {len(self.attribution_channel_data)} cached channel metrics")
            channel_metrics = self.attribution_channel_data
        else:
            # Fallback to retrieval
            channel_docs = self._fast_retrieval(
                query, top_k=20, types=["attribution_channel"]
            )
            print(f"Retrieved {len(channel_docs)} channel docs")
            # Extract raw data
            for doc in channel_docs:
                if "raw_data" in doc.get("extra_info", {}):
                    channel_metrics.append(doc["extra_info"]["raw_data"])
                elif doc_id := doc["extra_info"].get("id"):
                    # Try to get from cache using the composite ID
                    if "_" in doc_id:  # Ensure it's the composite ID
                        cache_entry = self.document_cache.get(f"channel_{doc_id}")
                        if cache_entry and "data" in cache_entry:
                            channel_metrics.append(cache_entry["data"])

        # Get feature metrics data - NEW SECTION
        try:
            print("Fetching feature metrics data for attribution analysis")
            feature_metrics_result = (
                self.supabase.table("feature_metrics_summary").select("*").execute()
            )
            feature_metrics = feature_metrics_result.data
            print(f"Fetched {len(feature_metrics)} feature metrics records")
        except Exception as e:
            print(f"Error fetching feature metrics: {str(e)}")

        # If we still don't have data, try direct database query as a last resort
        if not campaign_metrics:
            try:
                print(
                    "Attempting direct database query for campaign metrics as fallback"
                )
                campaign_metrics_result = (
                    self.supabase.table("enhanced_ad_metrics_by_campaign")
                    .select("*")
                    .execute()
                )
                campaign_metrics = campaign_metrics_result.data
                # Update our cache for future use
                self.attribution_campaign_data = campaign_metrics
                print(f"Direct query found {len(campaign_metrics)} campaign metrics")
            except Exception as e:
                print(f"Error in direct campaign metrics query: {str(e)}")

        if not channel_metrics:
            try:
                print(
                    "Attempting direct database query for channel metrics as fallback"
                )
                channel_metrics_result = (
                    self.supabase.table("enhanced_ad_metrics_by_channel")
                    .select("*")
                    .execute()
                )
                channel_metrics = channel_metrics_result.data
                # Update our cache for future use
                self.attribution_channel_data = channel_metrics
                print(f"Direct query found {len(channel_metrics)} channel metrics")
            except Exception as e:
                print(f"Error in direct channel metrics query: {str(e)}")

        # Print data counts for debugging
        print(
            f"Final data counts: {len(campaign_metrics)} campaigns, {len(channel_metrics)} channels, {len(feature_metrics)} features"
        )

        # Sort and get top performers
        top_campaigns = sorted(
            [c for c in campaign_metrics if c.get("avg_roas") is not None],
            key=lambda x: x.get("avg_roas", 0),
            reverse=True,
        )[:5]

        top_channels = sorted(
            [c for c in channel_metrics if c.get("avg_ctr") is not None],
            key=lambda x: x.get("avg_ctr", 0),
            reverse=True,
        )[:5]

        # Sort and get top performing features by ROAS - NEW SECTION
        top_features = sorted(
            [
                f
                for f in feature_metrics
                if f.get("avg_roas") is not None and f.get("unique_feature")
            ],
            key=lambda x: x.get("avg_roas", 0),
            reverse=True,
        )[:8]  # Get more features to have a broader analysis

        # Generate insights on feature categories and locations - NEW SECTION
        feature_category_analysis = self._analyze_feature_categories(feature_metrics)
        feature_location_analysis = self._analyze_feature_locations(feature_metrics)

        # Generate attribution insights with Perplexity LLM
        # Include feature performance data in the prompt
        attribution_prompt = f"""Analyze this attribution data and provide specific insights:

Campaign Data:
{json.dumps(campaign_metrics[:10], indent=2)}

Channel Data:
{json.dumps(channel_metrics[:10], indent=2)}

Feature Performance Data:
{json.dumps(top_features, indent=2)}

Key metrics to analyze:
1. Campaign & Channel Performance:
- Which campaigns and channels have the highest ROAS?
- Which campaigns and channels have the highest conversion rates?
- How do different channels compare on CPC and CPM?
- What are the efficiency trends across campaigns?

2. Visual Feature Performance:
- Which specific visual features drive the highest performance?
- In which categories do these features perform best?
- In which geographic locations do these features perform best?
- How do specific visual elements correlate with campaign performance?

Format your analysis with specific numbers and actionable insights.
Provide tactical recommendations based on both campaign/channel performance and visual feature effectiveness.
"""

        attribution_insights = "No attribution insights available."
        try:
            insights_response = self.perplexity_llm.complete(attribution_prompt)
            attribution_insights = insights_response.text
        except Exception as e:
            print(f"Error generating attribution insights: {str(e)}")

        print(
            f"Attribution analysis completed in {time.time() - start_time:.2f} seconds"
        )

        return AttributionData(
            campaign_metrics=campaign_metrics,
            channel_metrics=channel_metrics,
            top_performing_campaigns=top_campaigns,
            top_performing_channels=top_channels,
            top_performing_features=top_features,
            feature_category_analysis=feature_category_analysis,
            feature_location_analysis=feature_location_analysis,
            attribution_insights=attribution_insights,
        )

    def _analyze_feature_categories(self, feature_metrics: List[Dict[str, Any]]) -> str:
        """Analyze which categories perform best for different features"""
        if not feature_metrics:
            return "No feature category data available for analysis."

        try:
            # Create a mapping of categories to performance metrics
            category_performance = defaultdict(list)
            for feature in feature_metrics:
                if not feature.get("categories_ranked") or not feature.get("avg_roas"):
                    continue

                # Only consider top 2 categories for each feature
                top_categories = feature.get("categories_ranked", [])[:2]
                roas = feature.get("avg_roas", 0)
                ctr = feature.get("avg_ctr", 0)

                for category in top_categories:
                    category_performance[category].append(
                        {
                            "feature": feature.get("unique_feature", "Unknown"),
                            "roas": roas,
                            "ctr": ctr,
                        }
                    )

            # Sort categories by average ROAS performance
            sorted_categories = sorted(
                [
                    (cat, sum(f["roas"] for f in feats) / len(feats))
                    for cat, feats in category_performance.items()
                    if feats
                ],
                key=lambda x: x[1],
                reverse=True,
            )

            # Format the results
            if not sorted_categories:
                return "No clear patterns found in category performance."

            lines = ["## Top Performing Categories by ROAS", ""]
            for cat, avg_roas in sorted_categories[:5]:  # Top 5 categories
                lines.append(f"### {cat}: Average ROAS {avg_roas:.2f}")
                lines.append("Top performing features in this category:")

                # Get features for this category
                cat_features = category_performance[cat]
                # Sort by ROAS
                cat_features = sorted(
                    cat_features, key=lambda x: x["roas"], reverse=True
                )

                for feat in cat_features[:3]:  # Top 3 features in each category
                    lines.append(
                        f"- {feat['feature']}: ROAS {feat['roas']:.2f}, CTR {feat['ctr']:.2%}"
                    )
                lines.append("")

            return "\n".join(lines)

        except Exception as e:
            print(f"Error in feature category analysis: {str(e)}")
            return "Unable to analyze feature categories due to an error."

    def _analyze_feature_locations(self, feature_metrics: List[Dict[str, Any]]) -> str:
        """Analyze which geographic locations perform best for different features"""
        if not feature_metrics:
            return "No feature location data available for analysis."

        try:
            # Create a mapping of locations to performance metrics
            location_performance = defaultdict(list)
            for feature in feature_metrics:
                if not feature.get("locations_ranked") or not feature.get("avg_roas"):
                    continue

                # Only consider top 2 locations for each feature
                top_locations = feature.get("locations_ranked", [])[:2]
                roas = feature.get("avg_roas", 0)
                ctr = feature.get("avg_ctr", 0)

                for location in top_locations:
                    location_performance[location].append(
                        {
                            "feature": feature.get("unique_feature", "Unknown"),
                            "roas": roas,
                            "ctr": ctr,
                        }
                    )

            # Sort locations by average ROAS performance
            sorted_locations = sorted(
                [
                    (loc, sum(f["roas"] for f in feats) / len(feats))
                    for loc, feats in location_performance.items()
                    if feats
                ],
                key=lambda x: x[1],
                reverse=True,
            )

            # Format the results
            if not sorted_locations:
                return "No clear patterns found in location performance."

            lines = ["## Top Performing Locations by ROAS", ""]
            for loc, avg_roas in sorted_locations[:5]:  # Top 5 locations
                lines.append(f"### {loc}: Average ROAS {avg_roas:.2f}")
                lines.append("Top performing features in this location:")

                # Get features for this location
                loc_features = location_performance[loc]
                # Sort by ROAS
                loc_features = sorted(
                    loc_features, key=lambda x: x["roas"], reverse=True
                )

                for feat in loc_features[:3]:  # Top 3 features in each location
                    lines.append(
                        f"- {feat['feature']}: ROAS {feat['roas']:.2f}, CTR {feat['ctr']:.2%}"
                    )
                lines.append("")

            return "\n".join(lines)

        except Exception as e:
            print(f"Error in feature location analysis: {str(e)}")
            return "Unable to analyze feature locations due to an error."

    def _format_strategic_priorities(self) -> str:
        """Format strategic priorities from company context, handling optional fields"""
        priorities = COMPANY_CONTEXT.get("strategic_priorities", {})
        formatted = []

        for area, details in priorities.items():
            formatted.append(f"- {area.replace('_', ' ').title()}:")
            if isinstance(details, dict):  # Check if details is a dictionary
                if "focus_areas" in details:
                    formatted.append(
                        f"  - Focus Areas: {', '.join(details['focus_areas'])}"
                    )
                if "objectives" in details:
                    formatted.append(
                        f"  - Objectives: {', '.join(details['objectives'])}"
                    )
                if "initiatives" in details:
                    formatted.append(
                        f"  - Key Initiatives: {', '.join(details['initiatives'])}"
                    )

        return "\n".join(formatted) if formatted else "No strategic priorities defined"

    def _format_competitors(self) -> str:
        """Format competitor information from company context, handling optional fields"""
        try:
            competitors = COMPANY_CONTEXT.get("market_position", {}).get(
                "key_competitors", []
            )
            return ", ".join(
                f"{comp.get('name', 'Unknown')} ({', '.join(comp.get('primary_competition_areas', ['General']))})"
                for comp in competitors
            )
        except Exception:
            return "No competitor information available"

    def _format_challenges(self) -> str:
        """Format current challenges from company context, handling optional fields"""
        try:
            challenges = COMPANY_CONTEXT.get("internal_context", {}).get(
                "current_challenges", {}
            )
            formatted = []

            for area, items in challenges.items():
                if (
                    isinstance(items, list) and items
                ):  # Check if items is a non-empty list
                    formatted.append(
                        f"- {area.replace('_', ' ').title()}: {', '.join(items)}"
                    )

            return (
                "\n".join(formatted) if formatted else "No current challenges defined"
            )
        except Exception:
            return "No challenge information available"

    def _initialize_empty_chunks(self):
        """Initialize empty topic chunks as fallback if preprocessing fails"""
        print("Initializing empty topic chunks as fallback")

        # Create a single fallback topic
        self.topic_chunks = {
            "fallback": {
                "text": "No preprocessed chunks available. Using fallback retrieval.",
                "document_ids": list(self.document_cache.keys())[
                    :50
                ],  # Limit to 50 docs
                "keywords": ["fallback"],
            }
        }

        # Add to keyword index
        self.keyword_index = {"fallback": ["fallback"]}

        # Map all documents to fallback topic
        for doc_id in self.document_cache.keys():
            self.doc_to_topic_map[doc_id] = "fallback"

        # Add metadata
        self.topic_metadata["fallback"] = {
            "keywords": ["fallback"],
            "size": len(self.document_cache),
            "docs": list(self.document_cache.keys())[:50],
        }

    def stream_query(self, query: str, detail_level: int = 50):
        """
        Generator that streams the LLM output as SSE lines.
        Each line is a JSON object with the same structure as the regular API response.
        """
        print(f"Starting stream_query for: {query[:50]}...")

        # Check if query contains attribution-related terms
        attribution_keywords = [
            "attribution",
            "campaign performance",
            "channel performance",
            "roas",
            "roi",
            "conversion rate",
            "ctr",
            "cpc",
            "cpm",
            "which campaigns",
            "which channels",
            "best performing",
            "campaign metrics",
            "marketing performance",
            "ad spend",
            "visual features",  # Added visual feature related keywords
            "feature performance",
            "visual elements",
            "best categories",
            "top locations",
        ]

        has_attribution_terms = any(
            keyword in query.lower() for keyword in attribution_keywords
        )

        # Initialize response data structure
        response_data = {"response": "", "citations": [], "sources": []}

        # Decide which model to use based on detail_level - KEEP THIS THE SAME
        if detail_level < 50:
            self.perplexity_llm.model = "sonar-pro"
        else:
            self.perplexity_llm.model = "sonar-reasoning-pro"
            print(
                "Using reasoning model for detailed analysis (will show chain-of-thought)"
            )

        # Choose a prompt template - KEEP THIS THE SAME
        if detail_level < 50:
            template = self.qa_templates["compact"]
        elif detail_level < 85:
            template = self.qa_templates["comprehensive"]
        else:
            template = self.qa_templates["comprehensive"]

        if has_attribution_terms:
            template = self.qa_templates["attribution"]

        # Step 1: Retrieve relevant chunks using the SAME logic as _fast_query_engine
        max_chunks = 1  # Start with 1 chunk for lower detail levels
        if detail_level > 60:
            max_chunks = 2  # Use 2 chunks for medium detail
        if detail_level > 80:
            max_chunks = 3  # Use 3 chunks for high detail

        retrieved_sources = []
        context_text = ""

        # Try using chunk-based retrieval first - SAME AS _fast_query_engine
        try:
            if len(self.topic_chunks) > 0:
                print("Retrieving relevant ad campaigns and market research...")
                chunks, sources = self._retrieve_relevant_chunks(
                    query, max_chunks=max_chunks
                )
                retrieved_sources = sources

                # Check if we got meaningful results
                if not chunks or chunks[0].startswith(
                    "No preprocessed chunks available"
                ):
                    raise ValueError("No relevant ad campaigns found in database")

                # Step 2: Format context for the LLM - SAME AS _fast_query_engine
                context_text = "\n\n".join(chunks)
            else:
                raise ValueError("Ad campaign database not initialized")
        except Exception as e:
            # Fall back to vector search if chunk retrieval fails - SAME AS _fast_query_engine
            print(
                f"Chunk retrieval failed: {str(e)}. Falling back to comprehensive search."
            )
            top_k = int(min(20 + (detail_level / 200) * 80, 100))  # Use fewer documents
            print("Searching through complete ad and market research database...")
            retrieved_sources = self._fast_retrieval(query, top_k)

            # Format sources as context - SAME AS _fast_query_engine
            chunks = [
                "\n\n".join(
                    [
                        f"Campaign/Research Entry {i + 1} (Relevance: {source['score']:.2f}):\n{source['text']}"
                        for i, source in enumerate(retrieved_sources[:top_k])
                    ]
                )
            ]
            context_text = "\n\n".join(chunks)

        print(f"Retrieved {len(retrieved_sources)} sources for streaming query")
        print(f"Retrieved context of length {len(context_text)} for streaming query")

        # Update the response data with sources
        response_data["sources"] = retrieved_sources

        # Summarize context if it's too large - SAME AS _fast_query_engine
        if len(context_text.split()) > 2000 and detail_level < 70:
            # Truncate context for lower detail levels
            context_text = "\n\n".join(chunks[:1])
            print(
                f"Focusing on most relevant {len(context_text.split())} words of campaign data"
            )

        # Generate prompt using the template and chunks - SAME AS _fast_query_engine
        prompt = template.format(query_str=query, context_str=context_text)

        # KEY DIFFERENCE: Instead of calling complete() here like _fast_query_engine,
        # we use stream_complete() and yield the results

        # Ensure we reset the last_citations before streaming
        self.perplexity_llm.last_citations = []

        # Since stream_complete returns a regular generator, we need to iterate over it normally
        chunk_count = 0
        try:
            for chunk in self.perplexity_llm.stream_complete(prompt):
                chunk_count += 1

                # Debug info about the chunk
                if chunk_count % 20 == 0:  # Print only periodically to avoid log spam
                    print(
                        f"Received chunk #{chunk_count}, delta length: {len(chunk.delta) if chunk.delta else 0}"
                    )

                # Check if the chunk has a delta (some might not due to API behavior)
                text_piece = (
                    chunk.delta if hasattr(chunk, "delta") and chunk.delta else ""
                )

                # Check for citations in this chunk (may be present in some chunks)
                if hasattr(chunk, "citations") and chunk.citations:
                    print(f"Found {len(chunk.citations)} citations in chunk")
                    response_data["citations"] = chunk.citations

                # Also check if perplexity_llm has updated its citations
                if self.perplexity_llm.last_citations:
                    print(
                        f"Found {len(self.perplexity_llm.last_citations)} citations in LLM"
                    )
                    response_data["citations"] = self.perplexity_llm.last_citations

                # Only update and send non-empty pieces
                if text_piece:
                    # Update the response text
                    response_data["response"] += text_piece

                    # Serialize to JSON and yield as SSE data
                    json_data = json.dumps(response_data)
                    yield f"data: {json_data}\n\n"

            # After all chunks, explicitly check for citations from the LLM again
            # This is important as citations might only be available after the streaming is complete
            if hasattr(self.perplexity_llm, "get_last_citations"):
                citations = self.perplexity_llm.get_last_citations()
                if citations:
                    print(f"Found {len(citations)} citations after streaming")
                    response_data["citations"] = citations

            # Generate suggested tasks based on the final response
            # Only add to response if there are actual tasks
            # suggested_tasks = self._generate_suggested_tasks(response_data["response"])
            suggested_tasks = []
            if suggested_tasks and len(suggested_tasks) > 0:
                response_data["suggested_tasks"] = suggested_tasks

            # Send final complete response with all accumulated data
            final_json = json.dumps(response_data)
            yield f"data: {final_json}\n\n"

            print(
                f"Completed stream_complete iteration, processed {chunk_count} chunks"
            )

        except Exception as e:
            print(f"Error in stream_query: {e}")
            # For debugging, also yield the error so we can see it in the stream
            error_response = {"error": str(e), "response": response_data["response"]}
            yield f"data: {json.dumps(error_response)}\n\n"
            raise

        finally:
            # Always send a completion signal
            print("Sending final [DONE] marker")
            yield "data: [DONE]\n\n"


# Create a global instance of KnowledgeBase
# kb = None

# @app.post("/query")
# async def query_endpoint(request: QueryRequest):
#     """Enhanced endpoint that supports both simple queries and detailed reports"""
#     if not kb:
#         raise HTTPException(status_code=500, detail="Knowledge base not initialized")

#     try:
#         response = await kb.query(request.query, request.deep_research)
#         return response
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @app.get("/health")
# async def health_check():
#     """
#     Simple health check endpoint
#     """
#     return {"status": "healthy"}

# def main():
#     """Run the FastAPI server"""
#     uvicorn.run(app, host="0.0.0.0", port=8000)

# if __name__ == "__main__":
#     main()