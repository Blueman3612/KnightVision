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
    created_at: Optional[datetime] = Field(
        None, description="Lesson creation timestamp"
    )
    completed: Optional[bool] = Field(
        False, description="Whether the lesson is completed"
    )
    score: Optional[int] = Field(
        None, description="Score achieved by the player (0-100)"
    )


class LessonCompletionRequest(BaseModel):
    """Request model for marking a lesson as completed."""

    lesson_id: str = Field(..., description="ID of the lesson")
    score: Optional[int] = Field(None, description="Score achieved (0-100)")
