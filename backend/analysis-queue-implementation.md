# Comprehensive Implementation Plan: Scalable Chess Analysis System

## Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│  FastAPI    │    │   Redis     │    │  Worker Node 1  │
│  Backend    │───>│   Queue     │<───│  Analysis Tasks │
└─────────────┘    └─────────────┘    └─────────────────┘
       │                  ^                    ^
       │                  │                    │
       ▼                  │                    │
┌─────────────┐           │           ┌─────────────────┐
│  Supabase   │           └───────────│  Worker Node N  │
│  Database   │                       │  Analysis Tasks │
└─────────────┘                       └─────────────────┘
```

## Implementation Checklist

### 1. Redis Integration Setup

- [ ] Add Redis service to docker-compose-backend.yml:
  ```yaml
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 30s
      retries: 50
  ```

- [ ] Update volumes section:
  ```yaml
  volumes:
    # existing volumes...
    redis-data:
  ```

- [ ] Update environment variables in app service:
  ```yaml
  environment:
    # existing vars...
    REDIS_URL: "redis://redis:6379"
    WORKER_COUNT: 2  # Adjust based on container resources
  ```

- [ ] Add aioredis to requirements.txt:
  ```
  aioredis>=2.0.0
  ```

### 2. Queue Service Implementation

- [ ] Create `app/services/queue_service.py`:
  - [ ] Implement `AnalysisQueue` class with Redis connection
  - [ ] Add queue management methods (add/get/remove jobs)
  - [ ] Add result storage/retrieval methods
  - [ ] Add job priority handling
  - [ ] Initialize singleton instance

- [ ] Create `app/core/config.py` updates:
  - [ ] Add Redis configuration from environment variables
  - [ ] Add worker count configuration
  - [ ] Add analysis phase settings

### 3. Worker Implementation

- [ ] Create `app/worker/analysis_worker.py`:
  - [ ] Implement worker initialization logic
  - [ ] Add job processing flow
  - [ ] Implement phased analysis (initial, intermediate, complete)
  - [ ] Add error handling and recovery
  - [ ] Add logging for monitoring

- [ ] Create `app/worker/__init__.py`:
  - [ ] Register worker module

- [ ] Create streamlined analysis method in `app/services/analysis.py`:
  - [ ] Implement `analyze_game_quick` function for initial phases
  - [ ] Optimize for speed at lower depths

### 4. API Updates

- [ ] Update `app/api/routes/analysis.py`:
  - [ ] Modify `enhanced_annotate_game` endpoint to use queue
  - [ ] Add phased analysis result handling
  - [ ] Add progress tracking
  - [ ] Update waiting behavior

- [ ] Create new endpoint `get_analysis_status`:
  - [ ] Implement status checking against Redis and DB
  - [ ] Return phase and progress information

- [ ] Update `app/api/routes/game.py`:
  - [ ] Update `process_unannotated_games` to use queue system
  - [ ] Support bulk game queueing

### 5. Application Startup/Shutdown Changes

- [ ] Update `app/main.py`:
  - [ ] Initialize queue service at startup
  - [ ] Start worker tasks based on WORKER_COUNT
  - [ ] Add proper shutdown handling for workers
  - [ ] Update health checks to verify Redis connection

### 6. Database Schema Updates

- [ ] Update analysis result models in `app/models/analysis.py`:
  - [ ] Add phase information
  - [ ] Add progress tracking
  - [ ] Support partial results

- [ ] Update Supabase schema if needed:
  - [ ] Add queue status field to games table
  - [ ] Add analysis phase tracking

### 7. Testing and Validation

- [ ] Create unit tests:
  - [ ] Test queue service functionality
  - [ ] Test worker processing flow
  - [ ] Test phased analysis results

- [ ] Create integration tests:
  - [ ] Test end-to-end analysis flow
  - [ ] Verify incremental results
  - [ ] Test priority queue behavior

- [ ] Create load tests:
  - [ ] Test concurrent analysis requests
  - [ ] Verify scalability with multiple workers

### 8. Frontend Integration (If Applicable)

- [ ] Update frontend API calls:
  - [ ] Handle progressive analysis results
  - [ ] Add polling for status updates
  - [ ] Display progress indicators to users

- [ ] Add UI components:
  - [ ] Progress bar for analysis
  - [ ] Phase indicators
  - [ ] Refresh mechanism for new results

### 9. Deployment and Operations

- [ ] Create deployment scripts:
  - [ ] Redis initialization
  - [ ] Worker scaling configuration

- [ ] Add monitoring:
  - [ ] Queue length metrics
  - [ ] Worker performance tracking
  - [ ] Analysis time by phase
  - [ ] Cache hit/miss rates

- [ ] Create documentation:
  - [ ] Architecture overview
  - [ ] Configuration options
  - [ ] Scaling guidelines

## Detailed Implementation Steps

### Phase 1: Core Infrastructure (Weeks 1-2)

**Week 1: Redis Integration and Queue Service**

1. Set up Redis container and confirm connectivity
2. Implement basic queue service with job management
3. Add result storage and retrieval mechanisms
4. Test queue operations independently
5. Create initial test suite for queue service

**Week 2: Worker Implementation**

1. Create worker framework
2. Implement phased analysis approach
3. Connect workers to queue service
4. Add error handling and recovery logic
5. Test worker processing in isolation

### Phase 2: API Endpoints and Integration (Weeks 3-4)

**Week 3: API Updates**

1. Update analysis endpoints to use queue
2. Implement status endpoint
3. Connect API layer to queue service
4. Update documentation for new endpoints
5. Create API tests

**Week 4: Full System Integration**

1. Connect all components end-to-end
2. Test priority queue behavior
3. Verify phased result delivery
4. Load test with multiple simultaneous analyses
5. Fix integration issues

### Phase 3: Optimization and Monitoring (Weeks 5-6)

**Week 5: Performance Optimization**

1. Optimize worker processing
2. Fine-tune analysis phases
3. Implement additional caching strategies
4. Adjust resource allocation
5. Benchmark end-to-end performance

**Week 6: Monitoring and Dashboards**

1. Add comprehensive logging
2. Implement metrics collection
3. Create monitoring dashboards
4. Set up alerts for queue backlog
5. Document operational procedures

## Key Metrics to Track

1. **Queue Performance**
   - Average wait time
   - Queue length over time
   - Jobs processed per hour
   - Distribution by priority

2. **Analysis Performance**
   - Time per phase (initial, intermediate, complete)
   - Average processing time by game length
   - Cache hit rate
   - Error rate

3. **User Experience**
   - Time to first results
   - Total wait time
   - User satisfaction metrics

## Risk Mitigation Plan

1. **Redis Failure**
   - Implement connection retry logic
   - Add persistent volume for queue data
   - Create disaster recovery process

2. **Worker Failures**
   - Add automatic restart mechanism
   - Implement job timeout handling
   - Create dead letter queue for failed jobs

3. **Performance Degradation**
   - Set up auto-scaling based on queue length
   - Implement graceful degradation (lower depth)
   - Create circuit breakers for system protection

## Testing Checklist

- [ ] Unit test queue service methods
- [ ] Unit test worker processing function
- [ ] Integration test API endpoints with queue
- [ ] End-to-end test full analysis flow
- [ ] Load test with simulated concurrent users
- [ ] Performance test analysis phases
- [ ] Reliability test with worker failures
- [ ] Resilience test with Redis failures

## Code Snippets

### Queue Service Implementation

```python
# app/services/queue_service.py
import aioredis
import json
import os
import time
from typing import Dict, Optional, Any

class AnalysisQueue:
    def __init__(self):
        self.redis = None
        self.queue_key = "knight_vision:analysis_queue"
        self.results_key_prefix = "knight_vision:analysis_result:"
        self.processing_set = "knight_vision:processing"
    
    async def init(self):
        # Connect to Redis (from env vars or default localhost)
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis = await aioredis.from_url(redis_url)
    
    async def add_job(self, game_id: str, user_id: str, priority: int = 0) -> bool:
        """Add a game to the analysis queue."""
        job = {
            "game_id": game_id,
            "user_id": user_id,
            "priority": priority,
            "timestamp": time.time(),
            "status": "queued"
        }
        # Use Redis atomic operation to avoid race conditions
        return await self.redis.zadd(
            self.queue_key, 
            {json.dumps(job): -priority}  # Negative priority so higher = processed first
        )
    
    async def get_next_job(self) -> Optional[Dict]:
        """Get next job from the queue without removing it."""
        jobs = await self.redis.zrange(self.queue_key, 0, 0, withscores=False)
        if not jobs:
            return None
        
        job_data = json.loads(jobs[0])
        game_id = job_data.get("game_id")
        
        # Check if not already being processed
        if await self.redis.sismember(self.processing_set, game_id):
            # Skip this job since it's being processed
            return None
            
        return job_data

# Initialize singleton
analysis_queue = AnalysisQueue()
```

### Worker Implementation

```python
# app/worker/analysis_worker.py
import asyncio
import logging
import time
from typing import Optional, Dict

from app.services.queue_service import analysis_queue
from app.services.analysis import analysis_service
from app.db.supabase import get_supabase_client

logger = logging.getLogger(__name__)

async def start_worker(worker_id: int = 0):
    """Start a worker task that processes games from the queue."""
    logger.info(f"Analysis worker {worker_id} started")
    
    while True:
        try:
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
                
            logger.info(f"Worker {worker_id}: Processing game {game_id}")
            
            # PHASE 1: Quick initial analysis (depth 8)
            start_time = time.time()
            quick_result = await process_game_phase(game_id, user_id, phase="initial", depth=8)
            await analysis_queue.store_result(game_id, quick_result, phase="initial")
            
            # Continue with other phases...

        except asyncio.CancelledError:
            logger.info(f"Worker {worker_id}: Cancelled")
            break
        except Exception as e:
            logger.error(f"Worker {worker_id}: Unexpected error: {e}")
            # Brief pause to avoid tight error loops
            await asyncio.sleep(5)
```

### API Endpoint Update

```python
@router.post("/{game_id}/enhanced-annotate", response_model=GameAnalysisResult)
async def enhanced_annotate_game(
    game_id: str,
    user_id: str = Depends(get_current_user),
    wait_for_analysis: bool = False,
):
    """
    Analyze and annotate a specific chess game with enhanced tactical and positional metrics.
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to annotate games"
        )

    # Check if there are already results
    result = await analysis_queue.get_result(game_id)
    
    if result and result.get("phase") == "complete":
        # We have complete results, return them
        return GameAnalysisResult(**result.get("data", {}))
        
    # For non-waiting requests, queue for processing and return immediately
    if not wait_for_analysis:
        # Add to queue - use higher priority if user is paying/premium
        is_premium = check_if_premium_user(user_id)
        priority = 10 if is_premium else 0
        
        await analysis_queue.add_job(game_id, user_id, priority)
        
        return GameAnalysisResult(
            game_id=game_id,
            status="processing",
            message="Game has been queued for analysis and will be processed soon",
        )
    
    # Rest of implementation...
```