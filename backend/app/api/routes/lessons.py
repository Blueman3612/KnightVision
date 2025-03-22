import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.db.supabase import get_current_user
from app.models.lessons import LessonCompletionRequest, LessonRequest, LessonResponse
from app.services.lessons import lesson_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[LessonResponse])
async def get_player_lessons(
    limit: Optional[int] = 20, user_id: str = Depends(get_current_user)
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
    user_id: str = Depends(get_current_user),
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
                    lesson_service.store_lesson, player_id, lesson
                )

                all_lessons.append(lesson)
        except Exception as e:
            logger.error(f"Error processing game {game['id']}: {str(e)}")
            # Continue with other games if one fails

    if not all_lessons:
        return JSONResponse(
            status_code=200,
            content={"message": "No tactical blunders found in the analyzed games"},
        )

    return all_lessons


@router.get("/recommendations", response_model=List[LessonResponse])
async def get_lesson_recommendations(
    limit: Optional[int] = 3, user_id: str = Depends(get_current_user)
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
            status_code=401,
            detail="Authentication required to access lesson recommendations",
        )

    lessons = await lesson_service.get_recommended_lessons(user_id, limit)
    return lessons


@router.post("/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: str,
    request: LessonCompletionRequest,
    user_id: str = Depends(get_current_user),
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
