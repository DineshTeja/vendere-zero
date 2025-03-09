#!/usr/bin/env python3

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
    KeywordVariantGenerator,
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
    variant_generator = VariantGenerator()
    keyword_generator = KeywordVariantGenerator()
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
keyword_generator: Optional[KeywordVariantGenerator] = None


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


# Keyword Variant Generation Routes
@app.post("/keywords/generate", response_model=List[KeywordVariant])
async def generate_keyword_variants_endpoint(
    ad_features: AdFeatures,
    user_id: Optional[str] = None,
):
    """Generate keyword variants for ad features endpoint"""
    try:
        if not keyword_generator:
            raise HTTPException(
                status_code=500, detail="Keyword generator not initialized"
            )

        # Use test user ID if none is provided
        if not user_id:
            user_id = (
                "97d82337-5d25-4258-b47f-5be8ea53114c"  # Valid UUID format test user
            )
            logger.info(f"No user_id provided, using test user ID: {user_id}")
        else:
            logger.info(f"Received request with user_id: {user_id}")

        logger.info(
            f"Received keyword variant generation request for {ad_features.product_category} with image URL: {ad_features.image_url}"
        )

        # Validate that image_url is provided either in ad_features or as a separate parameter
        image_url = request.get("image_url")
        if not ad_features.image_url and not image_url:
            raise HTTPException(
                status_code=400,
                detail="An image URL is required - either in ad_features.image_url or as a separate image_url parameter",
            )

        # If image_url is provided as a separate parameter, ensure it's set in ad_features
        if image_url and not ad_features.image_url:
            ad_features.image_url = image_url
            logger.info(
                f"Using image URL from request parameter: {ad_features.image_url}"
            )

        # Add timeout to ensure faster response
        try:
            # Set max execution time to 45 seconds
            max_execution_time = 45  # seconds

            # Create task for variant generation
            variants_task = asyncio.create_task(
                keyword_generator.generate_keyword_variants(ad_features)
            )

            # Wait for task to complete with timeout
            variants = await asyncio.wait_for(variants_task, timeout=max_execution_time)

            # Filter to only include generated keywords and limit to 12
            generated_variants = [kw for kw in variants if kw.source == "generated"]
            logger.info(
                f"Generated {len(generated_variants)} variants for {set([kw.image_url for kw in generated_variants])}"
            )

            # Ensure we return exactly 12 variants (or all if less than 12)
            final_variants = generated_variants[: min(12, len(generated_variants))]

            # Save variants to database
            try:
                variant_ids = await keyword_generator.save_to_database(
                    final_variants, user_id
                )
                logger.info(
                    f"Successfully saved {len(variant_ids)} variants to database for user {user_id}"
                )
            except Exception as save_error:
                logger.error(f"Failed to save variants to database: {save_error}")
                # Continue processing even if saving fails

            logger.info(f"Returning {len(final_variants)} generated keyword variants")
            return final_variants

        except asyncio.TimeoutError:
            logger.warning(
                f"Generation timed out after {max_execution_time} seconds - returning partial results"
            )
            # If we timeout, return partial results if available or an empty list
            if "variants" in locals() and variants:
                generated_variants = [kw for kw in variants if kw.source == "generated"]
                partial_results = generated_variants[: min(12, len(generated_variants))]

                # Try to save partial results
                try:
                    await keyword_generator.save_to_database(partial_results, user_id)
                    logger.info(
                        f"Saved {len(partial_results)} partial results to database"
                    )
                except Exception as save_error:
                    logger.error(f"Failed to save partial results: {save_error}")

                return partial_results
            else:
                return []

    except Exception as e:
        logger.error(f"Error in generate_keyword_variants_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Export Keyword Variants Routes
@app.post("/keywords/export", response_model=dict)
async def export_keyword_variants_endpoint(
    ad_features: AdFeatures,
    user_id: Optional[str] = None,
):
    """Export keyword variants to CSV and JSON"""
    try:
        if not keyword_generator:
            raise HTTPException(
                status_code=500, detail="Keyword generator not initialized"
            )

        # Use test user ID if none is provided
        if not user_id:
            user_id = (
                "97d82337-5d25-4258-b47f-5be8ea53114c"  # Valid UUID format test user
            )
            logger.info(
                f"No user_id provided for export, using test user ID: {user_id}"
            )
        else:
            logger.info(f"Received export request with user_id: {user_id}")

        logger.info(
            f"Received keyword export request for {ad_features.product_category}"
        )

        # Add timeout to ensure faster response
        try:
            # Set max execution time to 45 seconds
            max_execution_time = 45  # seconds

            # Create task for variant generation
            variants_task = asyncio.create_task(
                keyword_generator.generate_keyword_variants(ad_features)
            )

            # Wait for task to complete with timeout
            variants = await asyncio.wait_for(variants_task, timeout=max_execution_time)

            # Filter to only include generated keywords and limit to 12
            generated_variants = [kw for kw in variants if kw.source == "generated"]
            final_variants = generated_variants[: min(12, len(generated_variants))]

            # Save variants to database
            try:
                variant_ids = await keyword_generator.save_to_database(
                    final_variants, user_id
                )
                logger.info(
                    f"Successfully saved {len(variant_ids)} variants to database for export"
                )
            except Exception as save_error:
                logger.error(
                    f"Failed to save variants to database during export: {save_error}"
                )
                # Continue processing even if saving fails

            # Export to both formats
            csv_path = await keyword_generator.export_to_csv(
                final_variants, ad_features
            )
            json_path = await keyword_generator.export_to_json(
                final_variants, ad_features
            )

            # Create a response with file paths
            response = {
                "total_variants": len(final_variants),
                "csv_export_path": csv_path,
                "json_export_path": json_path,
                "message": "Keyword variants successfully exported",
            }

            return response

        except asyncio.TimeoutError:
            logger.warning(
                f"Generation timed out after {max_execution_time} seconds - returning error"
            )
            raise HTTPException(
                status_code=408,
                detail=f"Keyword generation timed out after {max_execution_time} seconds",
            )

    except Exception as e:
        logger.error(f"Error in export_keyword_variants_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# New keyword management routes
@app.get("/keywords", response_model=List[Dict])
async def get_all_keywords_endpoint(user_id: Optional[str] = None):
    """Get all keywords with variant counts for a user"""
    try:
        if not keyword_generator:
            raise HTTPException(
                status_code=500, detail="Keyword generator not initialized"
            )

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        logger.info(f"Received request for all keywords for user {user_id}")
        keywords = await keyword_generator.get_all_keywords(user_id)
        logger.info(f"Returning {len(keywords)} keywords")
        return keywords
    except Exception as e:
        logger.error(f"Error in get_all_keywords_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/keywords/{keyword}/variants", response_model=List[Dict])
async def get_keyword_variants_endpoint(keyword: str, user_id: str):
    """Get all variants for a specific keyword"""
    try:
        if not keyword_generator:
            raise HTTPException(
                status_code=500, detail="Keyword generator not initialized"
            )

        logger.info(
            f"Received request for variants of keyword '{keyword}' for user {user_id}"
        )
        variants = await keyword_generator.get_variants_for_keyword(keyword, user_id)
        logger.info(f"Returning {len(variants)} variants for keyword '{keyword}'")
        return variants
    except Exception as e:
        logger.error(f"Error in get_keyword_variants_endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/keywords/batch-generate", response_model=Dict)
async def batch_generate_variants_endpoint(request: dict):
    """Generate variants for multiple keywords"""
    try:
        if not keyword_generator:
            raise HTTPException(
                status_code=500, detail="Keyword generator not initialized"
            )

        # Extract data from request
        ad_features_dict = request.get("ad_features", {})
        keywords = request.get("keywords", [])
        user_id = request.get("user_id")

        # Extract image URL directly from the request - it could come from mr_image_url or li_preview_url
        image_url = request.get("image_url")

        logger.info(f"Received request with image_url: {image_url}")

        if not keywords or not user_id:
            raise HTTPException(
                status_code=400, detail="Keywords and user_id are required"
            )

        if not image_url:
            raise HTTPException(
                status_code=400,
                detail="image_url is required for batch generation to properly associate variants with items",
            )

        logger.info(f"Received batch generation request for {len(keywords)} keywords")

        # Initialize results dictionary
        results: Dict[str, Any] = {
            "total_processed": len(keywords),
            "successful": 0,
            "failed": 0,
            "variants_generated": 0,
            "keywords": [],
        }

        for keyword in keywords:
            try:
                # Create ad features with the keyword
                ad_features = AdFeatures(**ad_features_dict)

                # Set the image_url in ad_features if available
                if image_url:
                    ad_features.image_url = image_url
                    logger.info(
                        f"Using image URL: {ad_features.image_url} for all keywords"
                    )

                # Generate variants
                variants = await keyword_generator.generate_keyword_variants(
                    ad_features, keyword
                )

                # Make sure each variant has the correct image_url
                for variant in variants:
                    if not variant.image_url and ad_features.image_url:
                        variant.image_url = ad_features.image_url

                # Save to database without item_id since it doesn't exist in the schema
                await keyword_generator.save_to_database(variants, user_id)

                # Update counters
                results["successful"] += 1
                results["variants_generated"] += len(variants)

                # Add to keywords list
                results["keywords"].append(
                    {
                        "keyword": keyword,
                        "status": "success",
                        "variants_count": len(variants),
                    }
                )

            except Exception as e:
                logger.error(
                    f"Error generating variants for keyword '{keyword}': {str(e)}"
                )
                # Update counter
                results["failed"] += 1

                # Add to keywords list
                results["keywords"].append(
                    {"keyword": keyword, "status": "failed", "error": str(e)}
                )

        logger.info(
            f"Batch generation completed: {results['successful']} successful, {results['failed']} failed"
        )
        return results
    except Exception as e:
        logger.error(f"Error in batch_generate_variants_endpoint: {str(e)}")
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


def main():
    """Run the FastAPI server"""
    port = int(os.getenv("PORT", "8000"))  # Default to port 8000 if not specified
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
