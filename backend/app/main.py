import os
import asyncio
import logging
from datetime import datetime, timedelta

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.background import BackgroundTasks

from app.api.routes import analysis, auth, game, health, lessons, user
from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.services.queue_service import analysis_queue
from app.worker import start_workers

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

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
app.include_router(lessons.router, prefix="/lessons", tags=["Lessons"])


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint for the Chess Tutor API."""
    return {"message": "Welcome to the Chess Tutor API!"}


# Background task to reset stale processing flags
async def reset_stale_processing_flags():
    """
    Reset processing flags for games that have been stuck in processing state.
    This helps recover from crashes or timeouts.
    """
    try:
        while True:
            try:
                logger.info("Checking for stale processing flags...")
                # Get Supabase client
                supabase = get_supabase_client()

                # Find games that are stuck in processing state
                stuck_games = (
                    supabase.table("games")
                    .select("id")
                    .eq("processing", True)
                    .execute()
                )

                # Reset each stuck game
                reset_count = 0
                for game in stuck_games.data:
                    supabase.table("games").update({"processing": False}).eq(
                        "id", game["id"]
                    ).execute()
                    reset_count += 1

                if reset_count > 0:
                    logger.info(f"Reset processing flag for {reset_count} stale games")

            except Exception as e:
                logger.error(f"Error in reset_stale_processing_flags: {e}")

            # Run once every hour
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        # Task was cancelled, clean up resources
        logger.info("Stale flag cleanup task was cancelled")


# Store worker tasks here for proper cleanup on shutdown
worker_tasks = []

# Start background tasks
@app.on_event("startup")
async def startup_event():
    """Start background tasks when the application starts."""
    global worker_tasks
    
    # Start the task to reset stale processing flags
    asyncio.create_task(reset_stale_processing_flags())
    
    # Initialize Redis queue with retry logic
    redis_ready = False
    retry_attempts = 5
    retry_delay = 5  # seconds
    
    for attempt in range(1, retry_attempts + 1):
        try:
            logger.info(f"Initializing Redis queue (attempt {attempt}/{retry_attempts})...")
            await analysis_queue.init()
            logger.info("✓ Redis queue initialized successfully")
            redis_ready = True
            break
        except Exception as e:
            logger.error(f"Failed to initialize queue system (attempt {attempt}): {e}")
            if attempt < retry_attempts:
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                # Increase delay for next attempt
                retry_delay *= 1.5
            else:
                logger.error("All Redis connection attempts failed!")
                logger.exception("Final stack trace for queue initialization error:")
    
    # Only start workers if Redis is ready
    if redis_ready:
        try:
            logger.info(f"Starting {settings.WORKER_COUNT} analysis workers...")
            worker_tasks = await start_workers(settings.WORKER_COUNT)
            logger.info(f"✓ Started {len(worker_tasks)} analysis workers successfully")
        except Exception as e:
            logger.error(f"Failed to start analysis workers: {e}")
            logger.exception("Stack trace for worker startup error:")
    else:
        logger.warning("Redis connection failed - analysis workers will not be started!")
    
    # Start the legacy game processing worker monitor
    try:
        # Import first to check if module exists
        from app.api.routes import game
        
        # Create and start the monitor task
        monitor_task = asyncio.create_task(game._ensure_worker_running())
        monitor_task.set_name("game_worker_monitor")
        logger.info("Started legacy game processing worker monitor")
    except Exception as e:
        logger.warning(f"Could not start game processing worker monitor: {e}")
        logger.exception("Stack trace for monitor start error:")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources when the application shuts down."""
    global worker_tasks
    
    logger.info("Application shutting down, cleaning up resources")
    
    # Cancel all analysis worker tasks
    for i, task in enumerate(worker_tasks):
        if not task.done():
            logger.info(f"Cancelling analysis worker task {i}")
            task.cancel()
    
    # Close Redis connection
    try:
        logger.info("Closing Redis connection")
        await analysis_queue.close()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.warning(f"Error closing Redis connection: {e}")
    
    # If there's a game processing queue in the game routes module, cancel its worker task (legacy)
    try:
        # Import the module, not just the variable
        from app.api.routes import game

        if hasattr(game, '_processing_task') and game._processing_task and not game._processing_task.done():
            logger.info("Cancelling legacy game processing worker task")
            game._processing_task.cancel()
            logger.info("Legacy game processing worker task cancelled")
        else:
            logger.info("No active legacy game processing worker task to cancel")
            
        # Set worker_alive to False to prevent any automatic restarts
        if hasattr(game, '_worker_alive'):
            game._worker_alive = False
            logger.info("Set worker_alive flag to False")
            
    except Exception as e:
        logger.warning(f"Could not access game processing task: {e}")
        logger.exception("Stack trace for shutdown error:")
