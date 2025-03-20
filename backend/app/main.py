from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from app.api.routes import game, user, auth, health, analysis
from app.core.config import settings

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Chess Tutor API",
    description="Backend API for the Chess Tutor application",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,  # 24 hours
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(user.router, prefix="/users", tags=["Users"])
app.include_router(game.router, prefix="/games", tags=["Games"])
app.include_router(analysis.router, prefix="/analysis", tags=["Analysis"])

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint for the Chess Tutor API."""
    return {"message": "Welcome to the Chess Tutor API!"} 