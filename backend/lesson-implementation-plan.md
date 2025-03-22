# Lessons Feature Implementation Plan

## Overview

This document outlines the implementation strategy for integrating a personalized chess lessons system into the Knight Vision backend. The system will analyze player's games, identify missed tactical opportunities, and generate tailored educational content focused on improving specific weaknesses.

## Implementation Strategy

### 1. File Structure

To minimize merge conflicts with parallel development on the tactics service, we'll create the following new files:

- **`app/api/routes/lessons.py`**: API endpoints for lesson generation and retrieval
- **`app/models/lessons.py`**: Pydantic models for lessons data
- **`app/services/lessons.py`**: Core services for lesson generation
- **`app/db/lessons.sql`**: SQL schema for lessons-related tables
- **`tests/test_lessons.py`**: Unit tests for lessons functionality

### 2. Database Schema

Add the following tables to the database:

```sql
-- File: app/db/lessons.sql
CREATE TABLE IF NOT EXISTS player_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES auth.users(id),
    lesson_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    position_fen TEXT NOT NULL,
    exercises JSONB NOT NULL DEFAULT '[]',
    associated_game_id UUID REFERENCES games(id),
    move_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    UNIQUE (player_id, position_fen, associated_game_id, move_number)
);

CREATE INDEX IF NOT EXISTS player_lessons_player_id_idx ON player_lessons(player_id);
```

### 3. Models

Create Pydantic models for lessons:

```python
# File: app/models/lessons.py
from typing import Dict, List, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime

class LessonExercise(BaseModel):
    """Model for a chess lesson exercise."""
    fen: str = Field(..., description="FEN notation of the position")
    question: str = Field(..., description="Exercise question")
    answer: str = Field(..., description="Correct answer (move in SAN)")
    hints: List[str] = Field(default_factory=list, description="Hints for solving")

class LessonRequest(BaseModel):
    """Request model for generating lessons."""
    player_id: str = Field(..., description="ID of the player")
    game_limit: int = Field(10, description="Maximum games to analyze", ge=1, le=50)

class LessonResponse(BaseModel):
    """Response model for a chess lesson."""
    id: Optional[str] = Field(None, description="Lesson ID")
    type: str = Field(..., description="Lesson type (e.g., tactical, endgame)")
    title: str = Field(..., description="Lesson title")
    content: str = Field(..., description="Lesson content")
    position_fen: str = Field(..., description="FEN notation of the position")
    exercises: List[LessonExercise] = Field(
        default_factory=list, description="Practice exercises"
    )
    associated_game_id: Optional[str] = Field(None, description="Associated game ID")
    move_number: Optional[int] = Field(None, description="Move number in the game")
    created_at: Optional[datetime] = Field(None, description="Lesson creation timestamp")
    completed: Optional[bool] = Field(False, description="Whether the lesson is completed")

class LessonCompletionRequest(BaseModel):
    """Request model for marking a lesson as completed."""
    lesson_id: str = Field(..., description="ID of the lesson")
    score: Optional[int] = Field(None, description="Score achieved (0-100)")
```

### 4. Lesson Services

Implement the lesson generation services:

```python
# File: app/services/lessons.py
import io
import chess
import chess.pgn
import logging
from typing import Dict, List, Optional, Tuple

from app.db.supabase import get_supabase_client
from app.services.stockfish import stockfish_service
from app.services.tactics import tactics_service

logger = logging.getLogger(__name__)

class LessonService:
    """Service for generating and managing chess lessons."""
    
    def __init__(self):
        """Initialize the lesson service."""
        self.tactic_descriptions = {
            'fork': "A fork is a tactic where a single piece attacks two or more opponent pieces simultaneously.",
            'pin': "A pin restricts an opponent's piece from moving because doing so would expose a more valuable piece to capture.",
            'skewer': "A skewer is similar to a pin, but the more valuable piece is in front and forced to move, exposing a less valuable piece behind it.",
            'discovered_check': "A discovered check occurs when a piece moves away from a line, revealing an attack on the opponent's king."
        }
    
    async def get_player_lessons(self, player_id: str) -> List[Dict]:
        """Retrieve existing lessons for a player."""
        supabase = get_supabase_client()
        response = (
            supabase.table("player_lessons")
            .select("*")
            .eq("player_id", player_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    
    async def get_player_games(self, player_id: str, limit: int = 10) -> List[Dict]:
        """Retrieve recent games for a player."""
        supabase = get_supabase_client()
        response = (
            supabase.table("games")
            .select("*")
            .eq("user_id", player_id)
            .eq("enhanced_analyzed", True)  # Only analyze games that have enhanced analysis
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data
    
    async def get_game_blunders(self, game_id: str, player_id: str) -> List[Dict]:
        """Find blunders in a game for the specified player."""
        supabase = get_supabase_client()
        
        # First get the game to determine player color
        game_response = (
            supabase.table("games")
            .select("*")
            .eq("id", game_id)
            .execute()
        )
        
        if not game_response.data:
            logger.warning(f"Game {game_id} not found")
            return []
        
        game = game_response.data[0]
        pgn = game.get("pgn") or game.get("moves_only", "")
        
        if not pgn:
            logger.warning(f"Game {game_id} has no PGN data")
            return []
        
        # Get enhanced annotations to find blunders
        annotation_response = (
            supabase.table("enhanced_move_annotations")
            .select("*")
            .eq("game_id", game_id)
            .order("move_number")
            .execute()
        )
        
        if not annotation_response.data:
            logger.warning(f"Game {game_id} has no enhanced annotations")
            return []
        
        # Find blunders (mistakes and blunders with significant eval change)
        blunders = []
        for annotation in annotation_response.data:
            if annotation["classification"] in ["blunder", "mistake"]:
                # Get the FEN before the move
                fen_before = annotation["fen_before"]
                
                # Use stockfish to find the best move at this position
                best_move_data = await stockfish_service.get_best_move_at_depth(fen_before, 20)
                
                if best_move_data and best_move_data["best_move"]:
                    # Check if the best move had tactical motifs
                    board = chess.Board(fen_before)
                    best_move = chess.Move.from_uci(best_move_data["best_move"])
                    
                    # Create a copy to analyze the position after the best move
                    board_copy = board.copy()
                    board_copy.push(best_move)
                    
                    # Analyze for tactics
                    tactical_motifs = tactics_service.analyze_move_for_tactics(
                        board, 
                        board_copy, 
                        best_move, 
                        is_best_move=True
                    )
                    
                    if tactical_motifs:
                        # This blunder had a tactical opportunity that was missed
                        blunder_data = {
                            'game_id': game_id,
                            'move_number': annotation["move_number"],
                            'fen': fen_before,
                            'best_move': best_move_data["best_move"],
                            'best_move_san': board.san(best_move),
                            'played_move': annotation["move_uci"],
                            'played_move_san': annotation["move_san"],
                            'eval_change': annotation["evaluation_change"],
                            'tactical_motifs': tactical_motifs,
                            'is_mate': best_move_data.get("is_mate", False)
                        }
                        blunders.append(blunder_data)
        
        return blunders
    
    def generate_lesson(self, blunder_data: Dict) -> Dict:
        """Generate a lesson from a blunder."""
        # Extract primary tactic type
        primary_tactic = None
        if blunder_data.get('tactical_motifs'):
            for motif in blunder_data['tactical_motifs']:
                primary_tactic = motif.motif_type
                break
        
        # Generate title
        if blunder_data.get('is_mate'):
            title = "Missed Checkmate Opportunity"
        elif primary_tactic:
            title = f"Missed {primary_tactic.replace('_', ' ').title()} Opportunity"
        else:
            title = "Missed Tactical Opportunity"
        
        # Generate content
        content_lines = []
        content_lines.append("In this position, you played " + blunder_data['played_move_san'] + ".")
        content_lines.append("However, there was a stronger move: " + blunder_data['best_move_san'] + ".")
        
        # Add tactic descriptions
        if primary_tactic and primary_tactic in self.tactic_descriptions:
            content_lines.append("\n" + self.tactic_descriptions[primary_tactic])
            content_lines.append(f"Let's see how {blunder_data['best_move_san']} creates a {primary_tactic.replace('_', ' ')}:")
        
        # Add evaluation explanation
        if blunder_data.get('is_mate'):
            content_lines.append("\nThis move would have led to a checkmate sequence!")
        else:
            eval_change = abs(blunder_data['eval_change'])
            content_lines.append(f"\nThis move would have given you a significant advantage of approximately {eval_change:.1f} pawns.")
        
        # Create exercise
        exercise = {
            'fen': blunder_data['fen'],
            'question': "What is the best move in this position?",
            'answer': blunder_data['best_move_san'],
            'hints': []
        }
        
        if primary_tactic:
            exercise['hints'].append(f"Look for a {primary_tactic.replace('_', ' ')}.")
        
        # Assemble lesson
        lesson = {
            'type': 'tactical',
            'title': title,
            'content': "\n".join(content_lines),
            'position_fen': blunder_data['fen'],
            'exercises': [exercise],
            'associated_game_id': blunder_data['game_id'],
            'move_number': blunder_data['move_number']
        }
        
        return lesson
    
    async def store_lesson(self, player_id: str, lesson_data: Dict) -> Dict:
        """Store a generated lesson in the database."""
        supabase = get_supabase_client()
        
        lesson_record = {
            'player_id': player_id,
            'lesson_type': lesson_data['type'],
            'title': lesson_data['title'],
            'content': lesson_data['content'],
            'position_fen': lesson_data['position_fen'],
            'exercises': lesson_data['exercises'],
            'associated_game_id': lesson_data['associated_game_id'],
            'move_number': lesson_data['move_number']
        }
        
        response = supabase.table("player_lessons").insert(lesson_record).execute()
        
        if response.data:
            return response.data[0]
        return None
    
    async def complete_lesson(self, lesson_id: str, score: Optional[int] = None) -> bool:
        """Mark a lesson as completed with an optional score."""
        supabase = get_supabase_client()
        
        update_data = {'completed': True}
        if score is not None:
            update_data['score'] = score
        
        response = (
            supabase.table("player_lessons")
            .update(update_data)
            .eq("id", lesson_id)
            .execute()
        )
        
        return len(response.data) > 0
    
    async def get_recommended_lessons(self, player_id: str, limit: int = 3) -> List[Dict]:
        """Get personalized lesson recommendations for a player."""
        supabase = get_supabase_client()
        
        # First get incomplete lessons
        response = (
            supabase.table("player_lessons")
            .select("*")
            .eq("player_id", player_id)
            .eq("completed", False)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        
        return response.data

# Create a singleton instance
lesson_service = LessonService()
```

### 5. API Routes

Create API endpoints for lesson functionality:

```python
# File: app/api/routes/lessons.py
import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.db.supabase import get_current_user
from app.models.lessons import (LessonCompletionRequest, LessonRequest,
                                LessonResponse)
from app.services.lessons import lesson_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[LessonResponse])
async def get_player_lessons(
    limit: Optional[int] = 20,
    user_id: str = Depends(get_current_user)
):
    """
    Get lessons for the current user.
    
    Args:
        limit: Maximum number of lessons to return
        user_id: Current authenticated user
    
    Returns:
        List[LessonResponse]: List of lessons
    """
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to access lessons"
        )
    
    lessons = await lesson_service.get_player_lessons(user_id)
    
    # Limit the number of lessons returned
    return lessons[:limit] if lessons else []

@router.post("/generate", response_model=List[LessonResponse])
async def generate_lessons(
    request: LessonRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user)
):
    """
    Generate new personalized lessons based on player's games.
    
    Args:
        request: Lesson generation request
        background_tasks: FastAPI background tasks
        user_id: Current authenticated user
    
    Returns:
        List[LessonResponse]: Generated lessons
    """
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to generate lessons"
        )
    
    # Override the player_id with authenticated user for security
    player_id = user_id
    
    # Get player's recent games
    games = await lesson_service.get_player_games(player_id, request.game_limit)
    
    if not games:
        raise HTTPException(
            status_code=404, detail="No analyzed games found for player"
        )
    
    all_lessons = []
    
    # Process each game to find blunders and generate lessons
    for game in games:
        try:
            blunders = await lesson_service.get_game_blunders(game["id"], player_id)
            
            for blunder in blunders:
                lesson = lesson_service.generate_lesson(blunder)
                
                # Store lesson in database as a background task
                background_tasks.add_task(
                    lesson_service.store_lesson,
                    player_id,
                    lesson
                )
                
                all_lessons.append(lesson)
        except Exception as e:
            logger.error(f"Error processing game {game['id']}: {str(e)}")
            # Continue with other games if one fails
    
    if not all_lessons:
        return JSONResponse(
            status_code=200,
            content={"message": "No tactical blunders found in the analyzed games"}
        )
    
    return all_lessons

@router.get("/recommendations", response_model=List[LessonResponse])
async def get_lesson_recommendations(
    limit: Optional[int] = 3,
    user_id: str = Depends(get_current_user)
):
    """
    Get personalized lesson recommendations for the current user.
    
    Args:
        limit: Maximum number of recommendations to return
        user_id: Current authenticated user
    
    Returns:
        List[LessonResponse]: Recommended lessons
    """
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to access lesson recommendations"
        )
    
    lessons = await lesson_service.get_recommended_lessons(user_id, limit)
    return lessons

@router.post("/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: str,
    request: LessonCompletionRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Mark a lesson as completed.
    
    Args:
        lesson_id: ID of the lesson to complete
        request: Lesson completion request with optional score
        user_id: Current authenticated user
    
    Returns:
        dict: Status message
    """
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to complete lessons"
        )
    
    success = await lesson_service.complete_lesson(lesson_id, request.score)
    
    if not success:
        raise HTTPException(
            status_code=404, detail="Lesson not found or could not be updated"
        )
    
    return {"message": "Lesson marked as completed"}
```

### 6. Integration with Main App

Update the app to include the new routes:

```python
# File: app/api/routes/__init__.py
# Add this line:
from app.api.routes import lessons
```

```python
# File: app/main.py
# Add this line where other routers are included:
app.include_router(lessons.router, prefix="/lessons", tags=["Lessons"])
```

### 7. Testing Strategy

- Unit tests for lesson generation logic
- Integration tests for API endpoints
- Sample blunder positions for consistent testing

## Dependencies and Interfaces

### Leveraging Stockfish Service

The lessons feature will use the existing `stockfish_service` to:
- Get best moves with `get_best_move_at_depth()`
- Evaluate positions and find missed opportunities

### Integrating with Tactics Service

The lessons feature will integrate with `tactics_service` to:
- Detect tactical motifs in best moves
- Analyze why certain moves would have been better

### Database Access

Lessons will use the Supabase client to:
- Query player games with completed enhanced analysis
- Store and retrieve generated lessons
- Update lesson completion status

## Future Extensions

1. **Expanded Lesson Types**:
   - Endgame lessons based on missed conversions
   - Opening principles based on early game mistakes
   - Positional lessons based on pawn structure

2. **Progressive Learning Path**:
   - Sequence lessons in increasing difficulty
   - Track player improvement over time
   - Suggest next learning steps

3. **Interactive Lessons**:
   - Add interactive exercises with multiple positions
   - Provide progressive hints during exercises
   - Include explanatory diagrams and annotations