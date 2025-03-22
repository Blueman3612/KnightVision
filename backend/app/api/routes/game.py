import io
import logging
import uuid
import asyncio
from typing import Dict, List, Optional, Union

import chess
import chess.pgn
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.db.supabase import get_current_user, get_supabase_client
from app.services.stockfish import stockfish_service

router = APIRouter()


class MoveRequest(BaseModel):
    """Request model for making a move."""

    fen: str = Field(..., description="FEN notation of the current position")
    move: str = Field(..., description="Move in UCI notation (e.g., 'e2e4')")


class MoveResponse(BaseModel):
    """Response model for a move."""

    fen: str = Field(..., description="FEN notation after the move")
    is_check: bool = Field(..., description="Whether the move results in a check")
    is_checkmate: bool = Field(
        ..., description="Whether the move results in a checkmate"
    )
    is_stalemate: bool = Field(
        ..., description="Whether the move results in a stalemate"
    )
    is_game_over: bool = Field(..., description="Whether the game is over")
    legal_moves: List[str] = Field(
        ..., description="List of legal moves in UCI notation"
    )


class BestMoveRequest(BaseModel):
    """Request model for getting the best move."""

    fen: str = Field(..., description="FEN notation of the current position")
    skill_level: int = Field(
        20, description="Stockfish skill level (0-20)", ge=0, le=20
    )
    move_time: float = Field(1.0, description="Time to calculate in seconds", gt=0)


class BestMoveResponse(BaseModel):
    """Response model for the best move."""

    move: str = Field(..., description="Best move in UCI notation")
    evaluation: float = Field(..., description="Position evaluation in pawns")
    is_mate: bool = Field(..., description="Whether the position leads to a mate")
    mate_in: Optional[int] = Field(
        None, description="Number of moves until mate (if is_mate is True)"
    )


class EvaluationRequest(BaseModel):
    """Request model for position evaluation."""

    fen: str = Field(..., description="FEN notation of the position to evaluate")
    depth: Optional[int] = Field(None, description="Search depth")


class EvaluationResponse(BaseModel):
    """Response model for position evaluation."""

    fen: str = Field(..., description="FEN notation of the evaluated position")
    evaluation: float = Field(..., description="Position evaluation in pawns")
    depth: int = Field(..., description="Search depth used")
    is_mate: bool = Field(..., description="Whether the position leads to a mate")
    mate_in: Optional[int] = Field(
        None, description="Number of moves until mate (if is_mate is True)"
    )
    best_move: Optional[str] = Field(None, description="Best move in UCI notation")


class EvenMoveRequest(BaseModel):
    """Request model for getting an even move response."""

    fen: str = Field(
        ..., description="FEN notation of the current position after player's move"
    )
    eval_change: float = Field(
        ..., description="Evaluation change from the player's previous move"
    )
    skill_level: int = Field(
        20, description="Stockfish skill level (0-20)", ge=0, le=20
    )
    move_time: float = Field(1.0, description="Time to calculate in seconds", gt=0)


class EvenMoveResponse(BaseModel):
    """Response model for an even move."""

    move: str = Field(..., description="Selected move in UCI notation")
    evaluation: float = Field(..., description="Position evaluation after the move")
    target_eval: float = Field(..., description="Target evaluation that was aimed for")
    eval_difference: float = Field(
        ..., description="Difference between achieved and target evaluation"
    )


class MoveAnnotation(BaseModel):
    """Model for a single move annotation."""

    move_number: int = Field(..., description="Move number")
    move_san: str = Field(..., description="Move in Standard Algebraic Notation")
    move_uci: str = Field(..., description="Move in UCI notation")
    color: str = Field(..., description="Color making the move (white or black)")
    fen_before: str = Field(..., description="FEN notation before the move")
    fen_after: str = Field(..., description="FEN notation after the move")
    evaluation_before: float = Field(
        ..., description="Position evaluation before the move"
    )
    evaluation_after: float = Field(
        ..., description="Position evaluation after the move"
    )
    evaluation_change: float = Field(..., description="Change in evaluation")
    classification: str = Field(..., description="Move classification")
    is_best_move: bool = Field(..., description="Whether this was the best move")
    is_book_move: bool = Field(False, description="Whether this is a book move")


class GameAnnotationResponse(BaseModel):
    """Response model for game annotation."""

    game_id: str = Field(..., description="Game ID")
    total_moves: int = Field(..., description="Total number of moves in the game")
    annotations: List[MoveAnnotation] = Field(
        ..., description="List of move annotations"
    )


class BatchAnnotationRequest(BaseModel):
    """Request model for batch processing unannotated games."""

    limit: int = Field(
        10, description="Maximum number of games to process", ge=1, le=50
    )


class BatchAnnotationResponse(BaseModel):
    """Response model for batch annotation."""

    processed_games: int = Field(..., description="Number of games processed")
    game_ids: List[str] = Field(..., description="List of processed game IDs")


@router.post("/move", response_model=MoveResponse)
async def make_move(move_request: MoveRequest):
    """
    Make a move on the chess board.

    Args:
        move_request: Move request with FEN and move

    Returns:
        MoveResponse: Updated board state after the move
    """
    try:
        # Create board from FEN
        board = chess.Board(move_request.fen)

        # Parse and validate move
        move = chess.Move.from_uci(move_request.move)
        if move not in board.legal_moves:
            raise HTTPException(status_code=400, detail="Illegal move")

        # Make the move
        board.push(move)

        # Get legal moves after the move
        legal_moves = [move.uci() for move in board.legal_moves]

        return MoveResponse(
            fen=board.fen(),
            is_check=board.is_check(),
            is_checkmate=board.is_checkmate(),
            is_stalemate=board.is_stalemate(),
            is_game_over=board.is_game_over(),
            legal_moves=legal_moves,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN or move format")


@router.post("/best-move", response_model=BestMoveResponse)
async def get_best_move(request: BestMoveRequest):
    """
    Get the best move for a given position with configurable strength.

    Args:
        request: Best move request with FEN and options

    Returns:
        BestMoveResponse: Best move and evaluation
    """
    try:
        result = await stockfish_service.get_best_move(
            request.fen, skill_level=request.skill_level, move_time=request.move_time
        )

        if not result["move"]:
            raise HTTPException(status_code=400, detail="No legal moves available")

        return BestMoveResponse(
            move=result["move"],
            evaluation=result["evaluation"],
            is_mate=result["is_mate"],
            mate_in=result["mate_in"],
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_position(request: EvaluationRequest):
    """
    Evaluate a chess position.

    This endpoint uses a standard depth of 12 by default for consistency across all evaluations.
    A custom depth can be provided, but it's recommended to use the standard depth in most cases.

    Args:
        request: Evaluation request with FEN and options

    Returns:
        EvaluationResponse: Position evaluation details
    """
    try:
        result = await stockfish_service.evaluate_position(request.fen, request.depth)

        return EvaluationResponse(
            fen=result["fen"],
            evaluation=result["evaluation"],
            depth=result["depth"],
            is_mate=result["is_mate"],
            mate_in=result["mate_in"],
            best_move=result["best_move"],
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")


@router.get("/new-game")
async def new_game():
    """
    Start a new chess game.

    Returns:
        Dict: Initial game state
    """
    board = chess.Board()

    return {
        "id": str(uuid.uuid4()),
        "fen": board.fen(),
        "legal_moves": [move.uci() for move in board.legal_moves],
        "is_game_over": False,
    }


@router.post("/{game_id}/annotate", response_model=GameAnnotationResponse)
async def annotate_game(game_id: str, user_id: str = Depends(get_current_user)):
    """
    Analyze and annotate a specific chess game.

    All position evaluations use the standard depth of 12 for consistency,
    ensuring reliable and comparable move classifications across games.

    Args:
        game_id: ID of the game to annotate
        user_id: Current authenticated user

    Returns:
        GameAnnotationResponse: The annotated game with move classifications
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to annotate games"
        )

    supabase = get_supabase_client()

    try:
        # Get the game from the database
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()

        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, detail=f"Game with ID {game_id} not found"
            )

        game = game_response.data[0]

        # Check if game belongs to the user
        if game.get("user_id") != user_id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to annotate this game",
            )

        # Check if the game is already annotated
        if game.get("analyzed", False):
            # If already annotated, just return the existing annotations
            annotations_response = (
                supabase.table("move_annotations")
                .select("*")
                .eq("game_id", game_id)
                .order("move_number")
                .execute()
            )

            if len(annotations_response.data) == 0:
                # This is an inconsistent state - game marked as analyzed but no annotations
                logging.warning(
                    f"Game {game_id} marked as analyzed but has no annotations. Proceeding with annotation."
                )
            else:
                return GameAnnotationResponse(
                    game_id=game_id,
                    total_moves=len(annotations_response.data),
                    annotations=annotations_response.data,
                )

        # Parse the PGN
        pgn = game.get("pgn") or game.get("moves_only", "")
        if not pgn:
            raise HTTPException(
                status_code=400,
                detail="Game does not contain valid PGN data required for annotation",
            )

        # Parse the game
        try:
            chess_game = chess.pgn.read_game(io.StringIO(pgn))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid PGN format: {str(e)}")

        if not chess_game:
            raise HTTPException(status_code=400, detail="Invalid or empty PGN data")

        # Initialize board and prepare for annotation
        board = chess_game.board()
        move_annotations = []
        move_number = 1

        # Process each move in the game
        for node in chess_game.mainline():
            move = node.move
            move_san = board.san(move)
            move_uci = move.uci()
            color = "white" if board.turn == chess.WHITE else "black"

            # Get position before the move
            fen_before = board.fen()
            try:
                position_before = await stockfish_service.evaluate_position(fen_before)
                # Convert evaluation to white's perspective if it's black's turn
                if not board.turn:  # False means it's black's turn
                    logging.info(
                        f"Move {move_number} ({color}): Converting evaluation_before from {position_before['evaluation']} to {-position_before['evaluation']} (black to move)"
                    )
                    evaluation_before = -position_before["evaluation"]
                else:
                    logging.info(
                        f"Move {move_number} ({color}): Keeping evaluation_before as {position_before['evaluation']} (white to move)"
                    )
                    evaluation_before = position_before["evaluation"]
            except Exception as e:
                logging.error(
                    f"Error evaluating position before move {move_uci}: {str(e)}"
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Engine error during position evaluation: {str(e)}",
                )

            # Make the move
            board.push(move)

            # Get position after the move
            fen_after = board.fen()
            try:
                position_after = await stockfish_service.evaluate_position(fen_after)
                # Convert evaluation to white's perspective if it's black's turn
                if not board.turn:  # False means it's black's turn
                    logging.info(
                        f"Move {move_number} ({color}) after: Converting evaluation_after from {position_after['evaluation']} to {-position_after['evaluation']} (black to move)"
                    )
                    evaluation_after = -position_after["evaluation"]
                else:
                    logging.info(
                        f"Move {move_number} ({color}) after: Keeping evaluation_after as {position_after['evaluation']} (white to move)"
                    )
                    evaluation_after = position_after["evaluation"]
            except Exception as e:
                logging.error(
                    f"Error evaluating position after move {move_uci}: {str(e)}"
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Engine error during position evaluation: {str(e)}",
                )

            # Calculate evaluation change (always from white's perspective for storage)
            evaluation_change = evaluation_after - evaluation_before
            logging.info(
                f"Move {move_number} ({color}): Evaluation change from {evaluation_before} to {evaluation_after} = {evaluation_change} (white's perspective)"
            )

            # For classification, adjust based on whose move it was
            if color == "black":
                classification_change = (
                    -evaluation_change
                )  # Negate for black's perspective
                logging.info(
                    f"Move {move_number} ({color}): Classification change = {classification_change} (black's perspective)"
                )
            else:
                classification_change = evaluation_change
                logging.info(
                    f"Move {move_number} ({color}): Classification change = {classification_change} (white's perspective)"
                )

            # Classify the move based on the player's perspective change
            classification = classify_move(classification_change)

            # Check if this was the best move
            is_best_move = position_before.get("best_move") == move_uci

            # Create the annotation
            annotation = {
                "game_id": game_id,
                "move_number": move_number,
                "move_san": move_san,
                "move_uci": move_uci,
                "color": color,
                "fen_before": fen_before,
                "fen_after": fen_after,
                "evaluation_before": evaluation_before,
                "evaluation_after": evaluation_after,
                "evaluation_change": evaluation_change,
                "classification": classification,
                "is_best_move": is_best_move,
                "is_book_move": False,  # Not implementing book detection yet
            }

            move_annotations.append(annotation)

            # Increment move number when it's black's turn (after white's move)
            if color == "black":
                move_number += 1

        # Store annotations in the database
        try:
            for annotation in move_annotations:
                supabase.table("move_annotations").insert(annotation).execute()

            # Update the game as analyzed
            supabase.table("games").update({"analyzed": True}).eq(
                "id", game_id
            ).execute()
        except Exception as e:
            logging.error(f"Database error while storing annotations: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to store annotations in database: {str(e)}",
            )

        # Format the response
        return GameAnnotationResponse(
            game_id=game_id,
            total_moves=len(move_annotations),
            annotations=move_annotations,
        )
    except HTTPException:
        # Re-raise HTTP exceptions as they're already formatted
        raise
    except Exception as e:
        logging.error(f"Unexpected error annotating game {game_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error annotating game: {str(e)}")


from app.api.routes.analysis import enhanced_annotate_game


# Global processing queue and task
_processing_queue = asyncio.Queue()
_processing_task = None


# Function to process games sequentially in the background
async def _process_games_worker():
    """Worker function that processes games one at a time."""
    while True:
        try:
            # Get the next game to process
            game_id, user_id = await _processing_queue.get()

            try:
                logging.info(f"Processing game {game_id} from queue")
                supabase = get_supabase_client()

                # Process the game with wait_for_analysis=True to ensure full processing
                await enhanced_annotate_game(
                    game_id=game_id, user_id=user_id, wait_for_analysis=True
                )
                logging.info(f"Successfully processed game {game_id}")
            except Exception as e:
                logging.error(f"Error processing game {game_id}: {str(e)}")
            finally:
                # Always clear the processing flag
                try:
                    supabase = get_supabase_client()
                    supabase.table("games").update({"processing": False}).eq(
                        "id", game_id
                    ).execute()
                except Exception as reset_err:
                    logging.error(
                        f"Error resetting processing flag for game {game_id}: {str(reset_err)}"
                    )

                # Mark this task as done in the queue
                _processing_queue.task_done()

        except asyncio.CancelledError:
            # Handle cancellation gracefully
            logging.info("Game processing worker cancelled")
            break
        except Exception as e:
            logging.error(f"Error in game processing worker: {str(e)}")
            # Sleep briefly to avoid tight loop in case of persistent errors
            await asyncio.sleep(1)


# Function to add a game to the processing queue
async def process_game_async(game_id: str, user_id: str, supabase=None):
    """
    Queue a game for processing.

    Args:
        game_id: ID of the game to process
        user_id: User ID for authentication
        supabase: Supabase client (unused, kept for compatibility)
    """
    global _processing_task

    logging.info(f"Received request to queue game {game_id} for user {user_id}")

    # Start the worker task if it's not running
    if _processing_task is None or _processing_task.done():
        logging.info("Starting new game processing worker task")
        _processing_task = asyncio.create_task(_process_games_worker())
        _processing_task.set_name(f"game_worker_{id(_processing_task)}")
        logging.info(f"Created worker task: {_processing_task.get_name()}")
    else:
        logging.info(
            f"Using existing worker task, status: {'running' if not _processing_task.done() else 'completed'}"
        )

    # Add the game to the queue
    await _processing_queue.put((game_id, user_id))
    queue_size = _processing_queue.qsize()
    logging.info(
        f"Game {game_id} added to processing queue, current queue size: {queue_size}"
    )


@router.post("/process-unannotated", response_model=BatchAnnotationResponse)
async def process_unannotated_games(
    request: BatchAnnotationRequest, user_id: str = Depends(get_current_user)
):
    """
    Process a batch of unannotated games using enhanced analysis.

    Args:
        request: Batch processing request with limit
        user_id: Current authenticated user

    Returns:
        BatchAnnotationResponse: Summary of processed games
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to process games"
        )

    supabase = get_supabase_client()

    try:
        # First, query for games that need processing
        # We need to do this in two steps since limit() is not available on update operations
        query_response = (
            supabase.table("games")
            .select("id")
            .eq("enhanced_analyzed", False)
            .eq("processing", False)  # Only select games not already being processed
            .limit(request.limit)
            .execute()
        )

        # Now mark these games as processing one by one
        games_to_process = []
        for game in query_response.data:
            game_id = game["id"]
            # Mark this game as processing
            update_response = (
                supabase.table("games")
                .update({"processing": True})
                .eq("id", game_id)
                .eq("enhanced_analyzed", False)
                .eq(
                    "processing", False
                )  # Only update if it's still not being processed
                .execute()
            )

            # Check if the update worked (someone else might have started processing it)
            if update_response.data and len(update_response.data) > 0:
                games_to_process.append(update_response.data[0])

        if len(games_to_process) == 0:
            return BatchAnnotationResponse(processed_games=0, game_ids=[])

        logging.info(f"Locked {len(games_to_process)} games for processing")

        # Extract game IDs to return immediately
        game_ids_to_process = [game_data["id"] for game_data in games_to_process]

        # Instead of waiting, add games to the processing queue
        for game_data in games_to_process:
            game_id = game_data["id"]
            # Add to the processing queue
            await process_game_async(game_id, user_id)
            logging.info(f"Added game {game_id} to processing queue")

        logging.info(
            f"Queued {len(game_ids_to_process)} games for asynchronous processing"
        )

        # Return immediately with the list of games being processed
        return BatchAnnotationResponse(
            processed_games=len(game_ids_to_process), game_ids=game_ids_to_process
        )
    except Exception as e:
        logging.error(f"Error in batch processing: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error in batch processing: {str(e)}"
        )


@router.get("/{game_id}/annotations", response_model=List[MoveAnnotation])
async def get_game_annotations(game_id: str, user_id: str = Depends(get_current_user)):
    """
    Retrieve annotations for a specific game.

    Args:
        game_id: ID of the game
        user_id: Current authenticated user

    Returns:
        List[MoveAnnotation]: List of move annotations for the game
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to access game annotations"
        )

    supabase = get_supabase_client()

    try:
        # First check if the game belongs to the user
        game_response = (
            supabase.table("games").select("user_id").eq("id", game_id).execute()
        )

        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, detail=f"Game with ID {game_id} not found"
            )

        game = game_response.data[0]
        if game["user_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to access annotations for this game",
            )

        # Get the annotations
        annotations_response = (
            supabase.table("move_annotations")
            .select("*")
            .eq("game_id", game_id)
            .order("move_number")
            .execute()
        )

        if len(annotations_response.data) == 0:
            # Check if the game is marked as analyzed
            game_check = (
                supabase.table("games").select("analyzed").eq("id", game_id).execute()
            )
            if game_check.data[0].get("analyzed", False):
                logging.warning(
                    f"Game {game_id} is marked as analyzed but has no annotations"
                )
                return []
            else:
                # Game isn't analyzed yet
                raise HTTPException(
                    status_code=404,
                    detail=f"Game with ID {game_id} has not been analyzed yet",
                )

        return annotations_response.data
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logging.error(f"Error retrieving annotations for game {game_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error retrieving annotations: {str(e)}"
        )


@router.post("/even-move", response_model=EvenMoveResponse)
async def get_even_move(request: EvenMoveRequest):
    """
    Get a move that attempts to restore the previous evaluation difference rather than maximizing advantage.
    This is ideal for beginner-friendly responses that don't immediately punish mistakes.

    All position evaluations use the standard depth of 12 for consistency.
    This endpoint uses a two-phase evaluation approach for better performance:
    1. First, all moves are evaluated at a shallow depth for quick filtering
    2. Then, only the most promising candidates are evaluated at full depth

    Args:
        request: Even move request with FEN, evaluation change, and options

    Returns:
        EvenMoveResponse: Selected move that aims for the target evaluation
    """
    try:
        # Call the optimized service method that implements the two-phase evaluation approach
        result = await stockfish_service.get_even_move(
            fen=request.fen,
            eval_change=request.eval_change,
            skill_level=request.skill_level,
            move_time=request.move_time,
        )

        return EvenMoveResponse(
            move=result["move"],
            evaluation=result["evaluation"],
            target_eval=result["target_eval"],
            eval_difference=result["eval_difference"],
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error getting even move: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")


def classify_move(evaluation_change: float) -> str:
    """
    Classify a move based on evaluation change.

    Args:
        evaluation_change: Change in evaluation in pawns

    Returns:
        str: Classification (blunder, mistake, inaccuracy, good, great, excellent)
    """
    if evaluation_change < -2.0:
        return "blunder"
    elif evaluation_change < -1.0:
        return "mistake"
    elif evaluation_change < -0.5:
        return "inaccuracy"
    elif evaluation_change < 0.1:
        return "good"
    elif evaluation_change < 0.5:
        return "great"
    else:
        return "excellent"
