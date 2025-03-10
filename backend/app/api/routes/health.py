from fastapi import APIRouter, Depends
from pydantic import BaseModel
import chess
import os

from app.services.stockfish import stockfish_service
from app.core.config import settings

router = APIRouter()

class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    api_version: str
    stockfish_available: bool
    environment: str

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    
    Returns:
        HealthResponse: Health status information
    """
    # Check if Stockfish is available
    stockfish_available = os.path.exists(settings.STOCKFISH_PATH)
    
    return HealthResponse(
        status="ok",
        api_version="0.1.0",
        stockfish_available=stockfish_available,
        environment=settings.ENVIRONMENT
    ) 