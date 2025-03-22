import os
import logging
from typing import Dict, Any

import chess
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.stockfish import stockfish_service
from app.services.queue_service import analysis_queue

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    api_version: str
    stockfish_available: bool
    environment: str
    redis_connected: bool
    redis_info: Dict[str, Any] = Field(default_factory=dict)
    queue_length: int = 0
    processing_count: int = 0
    worker_count: int = 0


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.

    Returns:
        HealthResponse: Health status information
    """
    # Check if Stockfish is available
    stockfish_available = os.path.exists(settings.STOCKFISH_PATH)
    
    # Check Redis connection with more detailed diagnostics
    redis_connected = False
    queue_length = 0
    processing_count = 0
    redis_info = {"connected": False, "error": None, "url": None}
    
    try:
        if analysis_queue.redis:
            # Try to get the connection URL for diagnostics
            try:
                redis_info["url"] = settings.REDIS_URL
            except Exception:
                redis_info["url"] = "unknown"
                
            # Test Redis connection
            try:
                await analysis_queue.redis.ping()
                redis_connected = True
                redis_info["connected"] = True
                
                # Get queue metrics
                queue_length = await analysis_queue.get_queue_length()
                processing_count = await analysis_queue.get_processing_count()
            except Exception as e:
                redis_info["error"] = str(e)
                redis_connected = False
        else:
            redis_info["error"] = "Redis client not initialized"
    except Exception as e:
        redis_info["error"] = str(e)
        redis_connected = False
        
    logger.info(f"Redis connection status: {redis_info}")

    return HealthResponse(
        status="ok",
        api_version="0.1.0",
        stockfish_available=stockfish_available,
        environment=settings.ENVIRONMENT,
        redis_connected=redis_connected,
        redis_info=redis_info,
        queue_length=queue_length,
        processing_count=processing_count,
        worker_count=settings.WORKER_COUNT,
    )
    

@router.get("/health/queue")
async def queue_health():
    """
    Detailed queue health check endpoint.
    
    Returns:
        dict: Detailed queue metrics
    """
    if not analysis_queue.redis:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Queue service not initialized",
        )
    
    try:
        # Test Redis connection
        await analysis_queue.redis.ping()
        
        # Get queue metrics
        queue_length = await analysis_queue.get_queue_length()
        processing_count = await analysis_queue.get_processing_count()
        
        return {
            "status": "ok",
            "queue_length": queue_length,
            "processing_count": processing_count,
            "worker_count": settings.WORKER_COUNT,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Queue service error: {str(e)}",
        )
