from llama_index.core.storage import StorageContext
from llama_index.core import VectorStoreIndex, Document, Settings
from llama_index.vector_stores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client, ClientOptions
from fastapi import FastAPI
from pydantic import BaseModel, Field
import json
import os
import asyncio
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import requests
import time
from functools import lru_cache
from collections import Counter, defaultdict
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
import numpy as np
from llama_index.core.llms import (
    CustomLLM,
    CompletionResponse,
    CompletionResponseGen,
    LLMMetadata,
)
from llama_index.core.llms.callbacks import llm_completion_callback
from pathlib import Path
from dotenv import load_dotenv
from llama_index.core import PromptTemplate
from company_context import COMPANY_CONTEXT
from llama_index.program.openai import OpenAIPydanticProgram
from llama_index.llms.openai import OpenAI
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
    deep_research: bool = False
    detail_level: int = Field(default=50, ge=0, le=100)


class ReportSection(BaseModel):
    title: str
    content: str
    sources: List[Dict]


class Report(BaseModel):
    title: str
    sections: List[ReportSection]
    summary: str


class DataPoint(BaseModel):
    """A single piece of evidence from the knowledge base with its metadata."""

    content: str = Field(description="The actual content/text of the data point")
    source_type: str = Field(
        description="Type of source: 'ad', 'market_research', or 'citation'"
    )
    url: str = Field(default="", description="URL to the source if available")
    image_url: str = Field(
        default="", description="URL to associated image if available"
    )
    relevance_score: float = Field(
        description="Relevance score of this data point to the query"
    )


class ResearchArea(BaseModel):
    """A specific area of research in the report with its findings and evidence."""

    title: str = Field(description="Title of this research area")
    format_guide: str = Field(
        description="Specific format and structure for this section"
    )
    query_prompt: str = Field(
        description="Customized prompt to generate this section's content"
    )
    supporting_data: List[DataPoint] = Field(
        description="Evidence supporting the content"
    )


class StructuredReport(BaseModel):
    """A structured report containing analysis of the knowledge base data."""

    query: str = Field(description="The original query that prompted this report")
    areas: List[ResearchArea] = Field(
        description="Analysis areas with their format guides"
    )
    executive_summary: str = Field(
        description="High-level summary of the entire report"
    )


class PerplexityLLM(CustomLLM):
    context_window: int = 4096
    num_output: int = 1024
    model: str = "sonar-pro"
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
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a specialized AI assistant focused on providing comprehensive analysis of marketing and competitive data.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": self.num_output,
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
        response_text = self.complete(prompt, **kwargs).text
        response = ""
        # Simulate streaming by yielding one character at a time
        for char in response_text:
            response += char
            yield CompletionResponse(text=response, delta=char)

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
        type_filters = {"ad": [], "market_research": [], "citation": []}
        for doc_id, doc_info in self.document_cache.items():
            doc_type = doc_info.get("type")
            if doc_type in type_filters:
                type_filters[doc_type].append(doc_id)
        return type_filters

    def _fetch_all_data(self, supabase: Client) -> List[Document]:
        """Fetch all relevant data from Supabase and convert to Documents"""
        documents = []
        start_time = time.time()
        print("Fetching data from Supabase...")

        # Fetch ad library data
        ad_data = supabase.table("ad_structured_output").select("*").execute().data
        for ad in ad_data:
            doc = Document(
                text=f"Ad Description: {ad['image_description']}\nImage URL: {ad['image_url']}",
                extra_info={"type": "ad", "id": ad["id"], "url": ad["image_url"]},
            )
            documents.append(doc)
            # Cache document by ID for faster retrieval
            self.document_cache[ad["id"]] = {
                "document": doc,
                "type": "ad",
                "text": doc.text,
                "metadata": {"url": ad["image_url"]},
            }

        # Fetch market research data
        research_data = supabase.table("market_research_v2").select("*").execute().data
        for research in research_data:
            research_text = f"""
            Intent Summary: {research["intent_summary"]}
            Target Audience: {json.dumps(research["target_audience"], indent=2)}
            Pain Points: {json.dumps(research["pain_points"], indent=2)}
            Key Features: {json.dumps(research["key_features"], indent=2)}
            Competitive Advantages: {json.dumps(research["competitive_advantages"], indent=2)}
            Perplexity Insights: {research["perplexity_insights"]}
            """
            doc = Document(
                text=research_text,
                extra_info={
                    "type": "market_research",
                    "id": research["id"],
                    "image_url": research["image_url"],
                },
            )
            documents.append(doc)
            # Cache document
            self.document_cache[research["id"]] = {
                "document": doc,
                "type": "market_research",
                "text": doc.text,
                "metadata": {"image_url": research["image_url"]},
            }

        # Fetch citation research
        citation_data = supabase.table("citation_research").select("*").execute().data
        for citation in citation_data:
            citation_text = f"""
            Intent Summary: {citation["intent_summary"]}
            Primary Intent: {citation["primary_intent"]}
            Secondary Intents: {json.dumps(citation["secondary_intents"], indent=2)}
            Market Segments: {json.dumps(citation["market_segments"], indent=2)}
            Key Features: {json.dumps(citation["key_features"], indent=2)}
            Price Points: {json.dumps(citation["price_points"], indent=2)}
            Source URL: {citation["site_url"]}
            """
            doc = Document(
                text=citation_text,
                extra_info={
                    "type": "citation",
                    "id": citation["id"],
                    "image_url": citation["image_url"],
                    "url": citation["site_url"],
                },
            )
            documents.append(doc)
            # Cache document
            self.document_cache[citation["id"]] = {
                "document": doc,
                "type": "citation",
                "text": doc.text,
                "metadata": {
                    "image_url": citation["image_url"],
                    "url": citation["site_url"],
                },
            }

        print(
            f"Data fetching completed in {time.time() - start_time:.2f} seconds. Total documents: {len(documents)}"
        )
        return documents

    def _initialize_index(self):
        """Initialize the vector store and index, LLMs, and query engines"""
        documents = self._fetch_all_data(self.supabase)
        vector_store = SupabaseVectorStore(
            postgres_connection_string=os.getenv("DB_CONNECTION"),
            collection_name="library_items",
        )
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        # Create detailed company-specific prompt template
        company_name = COMPANY_CONTEXT.get("name", "Company")
        company_context = f"""You are an AI assistant for {company_name}, providing detailed analysis based on our company context.
        
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
        - Current Market Trends: {", ".join(COMPANY_CONTEXT.get("market_position", {}).get("market_trends", {}).get("consumer_preferences", ["Not specified"]))}"""

        # Initialize QA templates for different detail levels
        self.qa_templates = create_qa_templates(company_context, company_name)

        self.index = VectorStoreIndex.from_documents(
            documents, storage_context=storage_context
        )

        # Initialize both LLMs
        self.perplexity_llm = PerplexityLLM(model="sonar-pro", temperature=0.1)
        openai_llm = OpenAI(model="gpt-4o-mini", temperature=0.1)

        # First set up OpenAI for structured program
        Settings.llm = openai_llm
        Settings.context_window = 8000
        Settings.num_output = 4000

        # Create structured program with OpenAI explicitly
        structured_prompt = f"""{company_context}
            
            Analyze the provided data and generate a structured report from {company_name}'s perspective.
            Focus on detailed analysis with comprehensive evidence and patterns.
            
            Available Data Types:
            - Market research with intent summaries and target audiences
            - Competitor citations with features and pricing
            - Ad analysis with visual descriptions
            
            Query: {{query}}
            Retrieved Context: {{context}}
            
            Return a structured report with these exact components:
            1. query: The original query text
            2. areas: A list of 3-4 research areas relevant to our priorities, each containing:
               - title: Clear section title aligned with our context
               - format_guide: Detailed format/structure (4-5 paragraphs per section)
               - query_prompt: Detailed prompt for company-specific analysis
               - supporting_data: List of relevant data points
            3. executive_summary: A thorough summary for leadership (2-3 paragraphs)
            
            Ensure each area:
            - Aligns with our strategic priorities
            - Considers our competitive positioning
            - Addresses our current challenges
            - Provides actionable insights
            - Maintains our market perspective"""

        self.structured_program = OpenAIPydanticProgram.from_defaults(
            output_cls=StructuredReport,
            llm=openai_llm,
            prompt_template_str=structured_prompt,
            verbose=True,
        )

        # Set up research query engine with OpenAI
        self.research_query_engine = self.index.as_query_engine(
            similarity_top_k=50,
            response_mode="refine",
            text_qa_template=self.qa_templates["standard"],
            llm=openai_llm,  # Explicitly pass OpenAI LLM
        )

        # Now switch to Perplexity for regular queries
        Settings.llm = self.perplexity_llm

        # # Initialize regular query engine with Perplexity
        # self.query_engine = self.index.as_query_engine(
        #     similarity_top_k=120,
        #     response_mode="compact",
        #     text_qa_template=self.qa_templates["compact"],
        #     llm=self.perplexity_llm,  # Explicitly pass Perplexity LLM
        # )

        # Create extended context for other methods
        self.company_context = f"""You are an AI assistant for {company_name}, 
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

    async def generate_section(self, area: ResearchArea) -> ReportSection:
        """Generate a single section of the report with retries and error handling"""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Query with the custom prompt for this section using research query engine
                section_response = self.research_query_engine.query(
                    f"""Generate a detailed analysis section about {area.title}.
                    
                    Specific Instructions:
                    {area.query_prompt}

                    Format your response using this structure: {area.format_guide}
                    
                    IMPORTANT: You must generate a NEW, DETAILED response. Never repeat or reference a previous answer.
                    
                    Requirements:
                    - Minimum 4-5 detailed paragraphs
                    - Specific examples and evidence
                    - Clear data citations
                    - In-depth analysis of patterns
                    - Comprehensive coverage of available data
                    
                    If you cannot generate a proper response, raise an error instead of returning a placeholder."""
                )

                content = str(section_response)

                # Check for invalid responses
                invalid_responses = [
                    "Repeat the original answer",
                    "I cannot generate",
                    "I apologize",
                    "As an AI",
                ]

                if any(phrase in content for phrase in invalid_responses):
                    raise ValueError("Invalid response detected")

                if len(content.split()) < 100:  # Minimum word count check
                    raise ValueError("Response too short")

                # Collect sources
                sources = [
                    {
                        "type": source_node.node.extra_info.get("type", "unknown"),
                        "content": source_node.node.text,
                        "url": source_node.node.extra_info.get("url", ""),
                        "image_url": source_node.node.extra_info.get("image_url", ""),
                        "relevance_score": float(source_node.score),
                    }
                    for source_node in section_response.source_nodes
                ]

                if not sources:
                    raise ValueError("No sources found in response")

                return ReportSection(title=area.title, content=content, sources=sources)

            except Exception:
                if attempt == max_retries - 1:  # Last attempt
                    # If all retries failed, generate a simplified but valid response
                    basic_response = self._fast_query_engine(
                        query=f"""Provide a basic but valid analysis of {area.title}.
                        Focus on the most important facts and evidence available.
                        Must include at least 2-3 paragraphs with specific data points.""",
                        detail_level=50,
                    )

                    return ReportSection(
                        title=area.title,
                        content=str(basic_response["response"]),
                        sources=[
                            {
                                "type": source["extra_info"].get("type", "unknown"),
                                "content": source["text"],
                                "url": source["extra_info"].get("url", ""),
                                "image_url": source["extra_info"].get("image_url", ""),
                                "relevance_score": float(source["score"]),
                            }
                            for source in basic_response["sources"][:10]
                        ],
                    )
                else:
                    # Wait briefly before retrying
                    await asyncio.sleep(1)
                    continue
        return None

    async def generate_report(self, query: str) -> Report:
        """Generates a structured report using OpenAI"""
        # Get initial context and plan the report structure
        initial_response = self.research_query_engine.query(  # Use research engine for initial query too
            f"""Analyze this query and determine the most effective way to structure a detailed report: {query}
            
            For each major area to cover, specify:
            1. The title of the section
            2. The ideal format/structure for presenting that specific type of information (minimum 4-5 paragraphs)
            3. A detailed prompt that will generate comprehensive analysis
            
            Consider the types of data available:
            - Market research with intent summaries and target audiences
            - Competitor citations with features and pricing
            - Ad analysis with visual descriptions
            
            Focus on creating sections that will provide unique, valuable insights rather than basic summaries.
            Each section should require detailed analysis with multiple examples and data points."""
        )

        # Generate structured report plan
        plan = self.structured_program(query=query, context=str(initial_response))

        # Generate all sections in parallel with error handling
        section_tasks = [self.generate_section(area) for area in plan.areas]
        sections = await asyncio.gather(*section_tasks, return_exceptions=True)

        # Filter out any failed sections and log them
        valid_sections = [
            section for section in sections if isinstance(section, ReportSection)
        ]

        return Report(
            title=query, sections=valid_sections, summary=plan.executive_summary
        )

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

        # Get raw retriever for faster direct operations
        retriever = self.index.as_retriever(similarity_top_k=top_k)

        # Apply type filtering during retrieval if specified
        if types:
            # Use type filters to get document IDs of specified types
            filtered_ids = []
            for doc_type in types:
                filtered_ids.extend(self.type_filters.get(doc_type, []))

            # If we have type filters, apply them in the retrieval
            if filtered_ids:
                # This assumes the retriever supports filtering, may need adjustment
                nodes = retriever.retrieve(query, filter_ids=filtered_ids)
            else:
                nodes = retriever.retrieve(query)
        else:
            nodes = retriever.retrieve(query)

        # Sort by relevance and limit to top_k
        nodes = sorted(nodes, key=lambda x: x.score, reverse=True)[:top_k]

        # Convert to lightweight format
        results = []
        for node in nodes:
            results.append(
                {
                    "text": node.node.text,
                    "score": float(node.score),
                    "extra_info": node.node.extra_info,
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
            self.perplexity_llm.model = "sonar"
        else:
            self.perplexity_llm.model = "sonar-pro"

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
        self, query: str, deep_research: bool = False, detail_level: int = 50
    ) -> dict:
        """Enhanced query method that supports both simple queries and structured reports"""
        if not deep_research:
            # Use the optimized fast query engine instead of the standard query engine
            print(f"Processing query with detail level {detail_level}: {query}")
            result = self._fast_query_engine(query, detail_level)

            return {
                "response": result["response"],
                "sources": result["sources"],
                "citations": result["citations"],
                "metadata": {
                    "detail_level": detail_level,
                    "retrieval_time": result["timing"]["retrieval_time"],
                    "llm_time": result["timing"]["llm_time"],
                    "total_time": result["timing"]["total_time"],
                    "llm_model": self.perplexity_llm.model,
                },
            }
        else:
            # Deep research mode remains unchanged
            report = await self.generate_report(query)
            return {
                "report": {
                    "title": report.title,
                    "sections": [
                        {
                            "title": section.title,
                            "content": section.content,
                            "sources": section.sources,
                        }
                        for section in report.sections
                    ],
                    "summary": report.summary,
                },
                "type": "detailed_report",
            }

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
