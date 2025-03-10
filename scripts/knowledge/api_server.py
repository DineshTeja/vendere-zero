#!/usr/bin/env python3

from traceback import print_exc
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
import uvicorn
import logging
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional, Dict, Any
import os
import asyncio
import time
from transformers import AutoModelForCausalLM, AutoProcessor  # type: ignore[import-untyped]
from pydantic import BaseModel
from scripts.hf_models import (
    florence_model,
    load_florence_model,
    get_image_from_url,
    parse_florence_result,
    TextRegion,
)

# Change relative imports to absolute imports
from scripts.knowledge.base_queries import KnowledgeBase, QueryRequest
from scripts.knowledge.market_view import (
    MarketResearchAnalyzer,
    MarketInsightRequest,
    MarketInsightResponse,
)
from scripts.knowledge.variants import VariantGenerator, VariantInput, GeneratedVariant

# Import KeywordVariantGenerator and related models
from scripts.knowledge.keyword_variants import (
    # KeywordVariantGenerator,
    AdFeatures,
    KeywordVariant,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

env_path = Path(__file__).parents[2] / ".env.local"
load_dotenv(env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for FastAPI"""
    global kb, market_analyzer, variant_generator, keyword_generator

    logger.info("Initializing services...")
    # kb = KnowledgeBase()
    # market_analyzer = MarketResearchAnalyzer()
    # variant_generator = VariantGenerator()
    load_florence_model()
    # keyword_generator = KeywordVariantGenerator()
    logger.info("Services initialized successfully")

    yield

    # Clean up on shutdown
    kb = None  # type: ignore
    market_analyzer = None  # type: ignore
    variant_generator = None  # type: ignore
    keyword_generator = None  # type: ignore

    logger.info("Services shut down")


app = FastAPI(
    title="Knowledge API",
    description="Combined API for knowledge base, market research, and variant generation",
    lifespan=lifespan,
)

# Global instances
kb: Optional[KnowledgeBase] = None
market_analyzer: Optional[MarketResearchAnalyzer] = None
variant_generator: Optional[VariantGenerator] = None

# keyword_generator: Optional[KeywordVariantGenerator] = None


# Knowledge Base Routes
@app.post("/knowledge/query")
async def query_endpoint(request: QueryRequest):
    """Knowledge base query endpoint"""
    if not kb:
        raise HTTPException(status_code=500, detail="Knowledge base not initialized")
    try:
        response = await kb.query(
            query=request.query,
            deep_research=request.deep_research,
            detail_level=request.detail_level,
        )
        return response
    except Exception as e:
        logger.error(f"Error in query endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/knowledge/query/stream")
async def query_stream_endpoint(request: QueryRequest):
    """
    Streaming knowledge base query endpoint.
    Yields SSE data from the LLM as it is generated.
    """
    if not kb:
        raise HTTPException(status_code=500, detail="Knowledge base not initialized")

    query = request.query
    detail_level = request.detail_level

    async def event_generator():
        try:
            # Stream with timeout protection
            start_time = time.time()
            max_duration = 120  # 2 minutes max

            # Get the generator from stream_query
            stream_gen = kb.stream_query(query, detail_level)

            # Since stream_query returns a regular generator (not async),
            # we need to iterate over it differently
            loop = asyncio.get_event_loop()

            while True:
                try:
                    # Use run_in_executor to get the next item from the generator without blocking
                    def get_next_item():
                        try:
                            return next(stream_gen)
                        except StopIteration:
                            return None

                    line = await loop.run_in_executor(None, get_next_item)
                    if line is None:  # StopIteration - generator is exhausted
                        break

                    yield line

                    # Check if we've exceeded the maximum allowed time
                    if time.time() - start_time > max_duration:
                        logger.warning(
                            f"Stream taking too long (over {max_duration}s), forcing completion"
                        )
                        yield f"data: Stream terminated due to timeout after {max_duration} seconds.\n\n"
                        yield "data: [DONE]\n\n"
                        return
                except Exception as e:
                    logger.error(f"Error iterating stream: {e}")
                    break

        except Exception as e:
            logger.error(f"Error in streaming response: {str(e)}")
            # Send error message in SSE format
            yield f"data: Error generating response: {str(e)}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            # Always send a [DONE] marker at the end to ensure completion
            yield "data: [DONE]\n\n"
            logger.info("Stream completed with [DONE] marker")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable buffering in nginx
        },
    )


# Market Research Routes
@app.post("/market/insight", response_model=MarketInsightResponse)
async def generate_market_insight_endpoint(request: MarketInsightRequest):
    """Generate market insight endpoint"""
    try:
        if not market_analyzer:
            raise HTTPException(
                status_code=500, detail="Market analyzer not initialized"
            )

        logger.info(f"Received market insight request for user {request.user_id}")
        insight = await market_analyzer.generate_market_insight(
            user_id=request.user_id, filters=request.filters
        )
        logger.info(f"Successfully generated market insight for user {request.user_id}")
        return insight
    except Exception as e:
        logger.error(f"Error in generate_market_insight_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Variant Generation Routes
@app.post("/variants/generate", response_model=List[GeneratedVariant])
async def generate_variants_endpoint(input_data: VariantInput):
    """Generate variants endpoint"""
    try:
        if not variant_generator:
            raise HTTPException(
                status_code=500, detail="Variant generator not initialized"
            )

        logger.info(
            f"Received variant generation request with {len(input_data.keywords)} keywords"
        )
        variants = await variant_generator.generate_variants(input_data)
        logger.info(f"Returning {len(variants)} generated variants")
        return variants
    except Exception as e:
        logger.error(f"Error in generate_variants_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    services_status = {
        "knowledge_base": kb is not None,
        "market_analyzer": market_analyzer is not None,
        "variant_generator": variant_generator is not None,
        "keyword_generator": keyword_generator is not None,
    }

    if all(services_status.values()):
        return {"status": "healthy", "services": services_status}
    else:
        return {"status": "degraded", "services": services_status}


# Test endpoint for debugging
@app.get("/test")
async def test_endpoint():
    """Simple test endpoint for debugging"""
    return {"message": "API server is running"}


# Add new request/response models
class OCRRequest(BaseModel):
    image_url: str


# Add new endpoint
@app.post("/ocr/detect", response_model=List[TextRegion])
async def detect_text_endpoint(request: OCRRequest):
    """Detect and extract text from an image using Florence model"""
    try:
        logger.info(f"Processing image URL: {request.image_url}")

        # Get image from URL
        try:
            image = get_image_from_url(request.image_url)
            logger.info(
                f"Image loaded successfully. Mode: {image.mode}, Size: {image.size}"
            )
        except Exception as e:
            logger.error(f"Error fetching image: {str(e)}")
            raise HTTPException(
                status_code=400, detail=f"Failed to fetch image from URL: {str(e)}"
            )

        # Process with Florence model
        try:
            # Set max execution time to 30 seconds
            max_execution_time = 30

            result = florence_model(image)
            structured_result = parse_florence_result(result)

            logger.info(
                f"Successfully processed image, found {len(structured_result)} text regions"
            )
            return structured_result

        except asyncio.TimeoutError:
            logger.error("OCR processing timed out")
            raise HTTPException(
                status_code=408,
                detail=f"OCR processing timed out after {max_execution_time} seconds",
            )
        except Exception as e:
            logger.error(f"Error processing image with Florence model: {str(e)}")
            print_exc()
            raise HTTPException(
                status_code=500, detail=f"Failed to process image: {str(e)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in detect_text_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def main():
    """Run the FastAPI server"""
    port = int(os.getenv("PORT", "8000"))  # Default to port 8000 if not specified
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
