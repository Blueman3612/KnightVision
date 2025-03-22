"""
Worker implementation for chess game analysis.
"""

import asyncio
import logging
import time
import traceback
from typing import Dict, List, Optional, Any

from app.services.queue_service import analysis_queue
from app.services.analysis import analysis_service
from app.db.supabase import get_supabase_client
from app.core.config import settings

logger = logging.getLogger(__name__)

async def process_game_phase(game_id: str, user_id: str, phase: str = "initial", 
                           depth: Optional[int] = None) -> Dict:
    """
    Process a specific phase of game analysis.
    
    Args:
        game_id: The ID of the game to analyze
        user_id: The ID of the user who requested analysis
        phase: Analysis phase (initial, intermediate, complete)
        depth: Analysis depth to use
        
    Returns:
        Dict: Analysis result data
    """
    supabase = get_supabase_client()
    
    # Get the game data
    game_data_response = await supabase.table("games").select("*").eq("id", game_id).execute()
    if not game_data_response.data:
        logger.error(f"Game {game_id} not found")
        return {"error": "Game not found"}
    
    game_data = game_data_response.data[0]
    pgn = game_data.get("pgn")
    
    if not pgn:
        logger.error(f"Game {game_id} has no PGN data")
        return {"error": "Game has no PGN data"}
    
    # Set depth based on phase if not specified
    if depth is None:
        if phase == "initial":
            depth = settings.ANALYSIS_QUICK_DEPTH
        else:
            depth = settings.ANALYSIS_FULL_DEPTH
    
    logger.info(f"Starting {phase} analysis of game {game_id} at depth {depth}")
    start_time = time.time()
    
    try:
        # Analyze the game
        result = await analysis_service.analyze_game(
            pgn=pgn,
            depth=depth,
            game_id=game_id
        )
        
        process_time = time.time() - start_time
        logger.info(f"{phase.capitalize()} analysis of game {game_id} completed in {process_time:.2f}s")
        
        # Update game status in database
        if phase == "complete":
            await supabase.table("games").update({
                "enhanced_analyzed": True,
                "analysis_completed_at": "now()"
            }).eq("id", game_id).execute()
        
        return result
    
    except Exception as e:
        logger.error(f"Error in {phase} analysis of game {game_id}: {str(e)}")
        logger.error(traceback.format_exc())
        return {"error": str(e)}

async def start_worker(worker_id: int = 0):
    """
    Start a worker task that processes games from the queue.
    
    Args:
        worker_id: Unique identifier for this worker
    """
    logger.info(f"Analysis worker {worker_id} started")
    
    while True:
        try:
            # Check for stalled jobs every 50 loops
            if worker_id == 0 and (time.time() % 300 < 10):  # Every ~5 minutes
                cleared = await analysis_queue.clear_stalled_jobs()
                if cleared:
                    logger.info(f"Cleared {cleared} stalled jobs")
            
            # Get next job
            job = await analysis_queue.get_next_job()
            if not job:
                # No jobs available or all being processed
                await asyncio.sleep(2)
                continue
                
            game_id = job.get("game_id")
            user_id = job.get("user_id")
            
            # Try to claim this job for processing
            if not await analysis_queue.start_processing(game_id):
                logger.info(f"Worker {worker_id}: Job for game {game_id} already claimed by another worker")
                continue
                
            # Remove from queue since we're processing it
            await analysis_queue.remove_job(job)
            
            logger.info(f"Worker {worker_id}: Processing game {game_id}")
            
            # PHASE 1: Quick initial analysis
            start_time = time.time()
            quick_result = await process_game_phase(
                game_id, 
                user_id, 
                phase="initial", 
                depth=settings.ANALYSIS_QUICK_DEPTH
            )
            
            # Store initial results
            await analysis_queue.store_result(game_id, quick_result, phase="initial")
            logger.info(f"Worker {worker_id}: Initial analysis for {game_id} completed in {time.time() - start_time:.2f}s")
            
            # PHASE 2: Full analysis
            start_time = time.time()
            full_result = await process_game_phase(
                game_id, 
                user_id, 
                phase="complete", 
                depth=settings.ANALYSIS_FULL_DEPTH
            )
            
            # Store complete results
            await analysis_queue.store_result(game_id, full_result, phase="complete")
            logger.info(f"Worker {worker_id}: Full analysis for {game_id} completed in {time.time() - start_time:.2f}s")
            
            # Mark as finished
            await analysis_queue.finish_processing(game_id)

        except asyncio.CancelledError:
            logger.info(f"Worker {worker_id}: Task cancelled")
            break
        except Exception as e:
            logger.error(f"Worker {worker_id}: Unexpected error: {e}")
            logger.error(traceback.format_exc())
            # Brief pause to avoid tight error loops
            await asyncio.sleep(5)

async def start_workers(count: int = settings.WORKER_COUNT):
    """
    Start multiple worker tasks.
    
    Args:
        count: Number of workers to start
    
    Returns:
        List[asyncio.Task]: List of worker tasks
    """
    tasks = []
    for i in range(count):
        task = asyncio.create_task(start_worker(i))
        tasks.append(task)
    
    logger.info(f"Started {count} analysis worker tasks")
    return tasks