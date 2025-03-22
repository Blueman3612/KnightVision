"""
Redis-backed queue service for managing chess analysis tasks.
"""

import aioredis
import json
import os
import time
import logging
from typing import Dict, List, Optional, Any, Union

from app.core.config import settings

logger = logging.getLogger(__name__)

class AnalysisQueue:
    """
    Queue service for chess game analysis tasks using Redis.
    
    This class handles:
    - Adding analysis jobs to the queue with priority
    - Processing jobs in order of priority
    - Storing intermediate and final analysis results
    - Tracking job progress and status
    """
    
    def __init__(self):
        """Initialize the queue service (connection established in init() method)."""
        self.redis = None
        self.queue_key = "knight_vision:analysis_queue"
        self.processing_set = "knight_vision:processing"
        self.results_key_prefix = "knight_vision:analysis_result:"
        self.status_key_prefix = "knight_vision:analysis_status:"
        
    async def init(self):
        """Initialize Redis connection."""
        redis_url = settings.REDIS_URL
        if not redis_url:
            redis_url = "redis://localhost:6379"  # Fallback
            
        # Add debug logs to track connection issues
        logger.info(f"Attempting to connect to Redis at {redis_url}")
        logger.info(f"Redis environment variable REDIS_URL = {os.getenv('REDIS_URL', 'not set')}")
        
        # Try different possible Redis URLs if the first fails
        possible_urls = [
            redis_url,
            "redis://localhost:6379",
            "redis://redis:6379",
            "redis://knight-vision-redis-1:6379",
            "redis://127.0.0.1:6379"
        ]
        
        connection_error = None
        
        for url in possible_urls:
            try:
                logger.info(f"Trying Redis connection with URL: {url}")
                self.redis = await aioredis.from_url(url)
                # Test Redis connection
                await self.redis.ping()
                logger.info(f"Redis connection established successfully with URL: {url}")
                # Update setting if we found a working URL different from the original
                if url != redis_url:
                    logger.info(f"Updating REDIS_URL setting to working URL: {url}")
                    settings.REDIS_URL = url
                return
            except Exception as e:
                logger.warning(f"Failed to connect to Redis at {url}: {e}")
                connection_error = e
                continue
        
        # If we get here, none of the URLs worked
        logger.error("All Redis connection attempts failed!")
        logger.error(f"Last error: {connection_error}")
        raise connection_error
    
    async def close(self):
        """Close Redis connection."""
        if self.redis:
            await self.redis.close()
            logger.info("Redis connection closed")
    
    async def add_job(self, game_id: str, user_id: str, priority: int = 0) -> bool:
        """
        Add a game to the analysis queue.
        
        Args:
            game_id: The ID of the game to analyze
            user_id: The ID of the user requesting analysis
            priority: Priority level (higher = higher priority, processes first)
            
        Returns:
            bool: True if job was added, False otherwise
        """
        job = {
            "game_id": game_id,
            "user_id": user_id,
            "priority": priority,
            "timestamp": time.time(),
            "status": "queued"
        }
        
        # Set initial status for this game
        status_data = {
            "status": "queued",
            "progress": 0,
            "phase": "waiting",
            "queue_time": time.time(),
            "start_time": None,
            "end_time": None
        }
        
        await self.redis.set(
            f"{self.status_key_prefix}{game_id}", 
            json.dumps(status_data)
        )
        
        # Use Redis sorted set to maintain priority queue
        # Negative priority so higher values are processed first
        return await self.redis.zadd(
            self.queue_key, 
            {json.dumps(job): -priority}
        )
    
    async def get_next_job(self) -> Optional[Dict]:
        """
        Get the next job from the queue without removing it.
        
        Returns:
            Dict or None: The next job data if available, None otherwise
        """
        # Get the highest priority job (lowest score)
        jobs = await self.redis.zrange(self.queue_key, 0, 0, withscores=False)
        if not jobs:
            return None
        
        job_data = json.loads(jobs[0])
        game_id = job_data.get("game_id")
        
        # Check if already being processed
        if await self.redis.sismember(self.processing_set, game_id):
            # Skip this job, it's already being processed
            return None
            
        return job_data
    
    async def remove_job(self, job_data: Dict) -> bool:
        """
        Remove a job from the queue.
        
        Args:
            job_data: The job data to remove
            
        Returns:
            bool: True if removed, False otherwise
        """
        return await self.redis.zrem(self.queue_key, json.dumps(job_data)) > 0
    
    async def start_processing(self, game_id: str) -> bool:
        """
        Mark a game as being processed to prevent duplicate processing.
        
        Args:
            game_id: The ID of the game being processed
            
        Returns:
            bool: True if successfully claimed, False if already being processed
        """
        # Atomically add to processing set if not already there
        was_added = await self.redis.sadd(self.processing_set, game_id)
        
        if was_added:
            # Update status
            status_data = await self.get_status(game_id)
            if status_data:
                status_data["status"] = "processing"
                status_data["phase"] = "initial"
                status_data["start_time"] = time.time()
                await self.redis.set(
                    f"{self.status_key_prefix}{game_id}", 
                    json.dumps(status_data)
                )
            
        return was_added > 0
    
    async def finish_processing(self, game_id: str) -> bool:
        """
        Mark a game as finished processing.
        
        Args:
            game_id: The ID of the game that finished processing
            
        Returns:
            bool: True if successful
        """
        # Remove from processing set
        await self.redis.srem(self.processing_set, game_id)
        
        # Update status
        status_data = await self.get_status(game_id)
        if status_data:
            status_data["status"] = "completed"
            status_data["progress"] = 100
            status_data["phase"] = "complete"
            status_data["end_time"] = time.time()
            await self.redis.set(
                f"{self.status_key_prefix}{game_id}", 
                json.dumps(status_data)
            )
        
        return True
    
    async def store_result(self, game_id: str, result: Dict, phase: str = "complete", ttl: int = 86400) -> bool:
        """
        Store analysis result for a game.
        
        Args:
            game_id: The ID of the game
            result: The analysis result data
            phase: The analysis phase (initial, intermediate, complete)
            ttl: Time to live in seconds (default 24 hours)
            
        Returns:
            bool: True if stored successfully
        """
        result_data = {
            "data": result,
            "timestamp": time.time(),
            "phase": phase
        }
        
        # Update status based on phase
        status_data = await self.get_status(game_id)
        if status_data:
            status_data["phase"] = phase
            
            # Set progress based on phase
            if phase == "initial":
                status_data["progress"] = 25
            elif phase == "intermediate":
                status_data["progress"] = 60
            elif phase == "complete":
                status_data["progress"] = 100
                status_data["status"] = "completed"
                status_data["end_time"] = time.time()
            
            await self.redis.set(
                f"{self.status_key_prefix}{game_id}", 
                json.dumps(status_data)
            )
        
        # Store result with TTL
        key = f"{self.results_key_prefix}{game_id}"
        await self.redis.set(key, json.dumps(result_data))
        await self.redis.expire(key, ttl)
        return True
    
    async def get_result(self, game_id: str) -> Optional[Dict]:
        """
        Get stored analysis result for a game.
        
        Args:
            game_id: The ID of the game
            
        Returns:
            Dict or None: The analysis result if available
        """
        key = f"{self.results_key_prefix}{game_id}"
        result = await self.redis.get(key)
        if not result:
            return None
        
        return json.loads(result)
    
    async def update_status(self, game_id: str, status: str = None, 
                           phase: str = None, progress: int = None) -> bool:
        """
        Update status for a game analysis task.
        
        Args:
            game_id: The ID of the game
            status: The current status (queued, processing, completed, error)
            phase: The analysis phase (waiting, initial, intermediate, complete)
            progress: Progress percentage (0-100)
            
        Returns:
            bool: True if updated successfully
        """
        status_data = await self.get_status(game_id)
        if not status_data:
            status_data = {
                "status": "unknown",
                "progress": 0,
                "phase": "unknown",
                "queue_time": time.time(),
                "start_time": None,
                "end_time": None
            }
        
        # Update fields if provided
        if status:
            status_data["status"] = status
        if phase:
            status_data["phase"] = phase
        if progress is not None:
            status_data["progress"] = progress
            
        # Store updated status
        await self.redis.set(
            f"{self.status_key_prefix}{game_id}", 
            json.dumps(status_data)
        )
        return True
    
    async def get_status(self, game_id: str) -> Optional[Dict]:
        """
        Get current status for a game analysis task.
        
        Args:
            game_id: The ID of the game
            
        Returns:
            Dict or None: The status data if available
        """
        key = f"{self.status_key_prefix}{game_id}"
        status = await self.redis.get(key)
        if not status:
            return None
        
        return json.loads(status)
    
    async def get_queue_length(self) -> int:
        """
        Get the current queue length.
        
        Returns:
            int: Number of jobs in queue
        """
        return await self.redis.zcard(self.queue_key)
    
    async def get_processing_count(self) -> int:
        """
        Get the number of games currently being processed.
        
        Returns:
            int: Number of games in processing
        """
        return await self.redis.scard(self.processing_set)
    
    async def clear_stalled_jobs(self, max_processing_time: int = 1800) -> int:
        """
        Clear stalled jobs (those stuck in processing state).
        
        Args:
            max_processing_time: Maximum allowed processing time in seconds
            
        Returns:
            int: Number of jobs cleared
        """
        current_time = time.time()
        processing_games = await self.redis.smembers(self.processing_set)
        cleared_count = 0
        
        for game_id in processing_games:
            status_data = await self.get_status(game_id.decode('utf-8'))
            if status_data and status_data.get("start_time"):
                processing_time = current_time - status_data["start_time"]
                if processing_time > max_processing_time:
                    # Clear this stalled job
                    await self.redis.srem(self.processing_set, game_id)
                    cleared_count += 1
                    
                    # Update status
                    status_data["status"] = "error"
                    status_data["error"] = "Processing timed out"
                    await self.redis.set(
                        f"{self.status_key_prefix}{game_id.decode('utf-8')}", 
                        json.dumps(status_data)
                    )
        
        return cleared_count

# Create singleton instance
analysis_queue = AnalysisQueue()