import os
from typing import List, Union, Optional

from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    """Application settings."""

    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = ENVIRONMENT == "development"

    # API
    API_PREFIX: str = "/api"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",  # Frontend dev server
        "https://knightvision.app",  # Production frontend
        "https://api.knightvision.app",
        "https://knight-vision-olive.vercel.app",  # Vercel frontend
    ]

    # Stockfish
    STOCKFISH_PATH: str = os.getenv("STOCKFISH_PATH", "/usr/bin/stockfish")
    STOCKFISH_DEPTH: int = 20  # Standard evaluation depth of 20 across all analysis
    STOCKFISH_THREADS: int = 4

    # Redis Queue Settings
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    WORKER_COUNT: int = int(os.getenv("WORKER_COUNT", "2"))
    
    # Analysis Settings
    ANALYSIS_QUICK_DEPTH: int = 10  # Depth for quick initial analysis
    ANALYSIS_FULL_DEPTH: int = 20   # Depth for critical positions
    ANALYSIS_CACHE_TTL: int = 86400  # 24 hours cache TTL
    
    # Maximum number of positions to analyze at full depth
    # Based on estimates of critical positions in an average game
    MAX_FULL_DEPTH_POSITIONS: int = 15
    
    # Position classification thresholds
    POSITION_CP_THRESHOLD: float = 0.5  # Centipawn threshold for significant change

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    @validator("SUPABASE_URL", "SUPABASE_KEY")
    def validate_supabase_credentials(cls, v, values, **kwargs):
        if not v and values.get("ENVIRONMENT") != "test":
            raise ValueError("Supabase credentials must be provided")
        return v

    class Config:
        case_sensitive = True


# Create settings instance
settings = Settings()
