import os
from typing import List, Union
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
        "https://chesstutor.example.com",  # Production frontend
        "https://knight-vision-olive.vercel.app",  # Vercel frontend
    ]
    
    # Stockfish
    STOCKFISH_PATH: str = os.getenv("STOCKFISH_PATH", "/usr/bin/stockfish")
    STOCKFISH_DEPTH: int = 20
    STOCKFISH_THREADS: int = 4
    
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