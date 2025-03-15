from fastapi import APIRouter, Depends, HTTPException, Body, Query
from pydantic import BaseModel, Field
import chess
import chess.pgn
import io
from typing import Dict, List, Optional, Union
import uuid
import logging

from app.services.stockfish import stockfish_service
from app.db.supabase import get_supabase_client, get_current_user

router = APIRouter()

class MoveRequest(BaseModel):
    """Request model for making a move."""
    fen: str = Field(..., description="FEN notation of the current position")
    move: str = Field(..., description="Move in UCI notation (e.g., 'e2e4')")

class MoveResponse(BaseModel):
    """Response model for a move."""
    fen: str = Field(..., description="FEN notation after the move")
    is_check: bool = Field(..., description="Whether the move results in a check")
    is_checkmate: bool = Field(..., description="Whether the move results in a checkmate")
    is_stalemate: bool = Field(..., description="Whether the move results in a stalemate")
    is_game_over: bool = Field(..., description="Whether the game is over")
    legal_moves: List[str] = Field(..., description="List of legal moves in UCI notation")

class BestMoveRequest(BaseModel):
    """Request model for getting the best move."""
    fen: str = Field(..., description="FEN notation of the current position")
    skill_level: int = Field(20, description="Stockfish skill level (0-20)", ge=0, le=20)
    move_time: float = Field(1.0, description="Time to calculate in seconds", gt=0)

class BestMoveResponse(BaseModel):
    """Response model for the best move."""
    move: str = Field(..., description="Best move in UCI notation")
    evaluation: float = Field(..., description="Position evaluation in pawns")
    is_mate: bool = Field(..., description="Whether the position leads to a mate")
    mate_in: Optional[int] = Field(None, description="Number of moves until mate (if is_mate is True)")

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
    mate_in: Optional[int] = Field(None, description="Number of moves until mate (if is_mate is True)")
    best_move: Optional[str] = Field(None, description="Best move in UCI notation")

class EvenMoveRequest(BaseModel):
    """Request model for getting an even move response."""
    fen: str = Field(..., description="FEN notation of the current position after player's move")
    eval_change: float = Field(..., description="Evaluation change from the player's previous move")
    skill_level: int = Field(20, description="Stockfish skill level (0-20)", ge=0, le=20)
    move_time: float = Field(1.0, description="Time to calculate in seconds", gt=0)
    
class EvenMoveResponse(BaseModel):
    """Response model for an even move."""
    move: str = Field(..., description="Selected move in UCI notation")
    evaluation: float = Field(..., description="Position evaluation after the move")
    target_eval: float = Field(..., description="Target evaluation that was aimed for")
    eval_difference: float = Field(..., description="Difference between achieved and target evaluation")

class MoveAnnotation(BaseModel):
    """Model for a single move annotation."""
    move_number: int = Field(..., description="Move number")
    move_san: str = Field(..., description="Move in Standard Algebraic Notation")
    move_uci: str = Field(..., description="Move in UCI notation")
    color: str = Field(..., description="Color making the move (white or black)")
    fen_before: str = Field(..., description="FEN notation before the move")
    fen_after: str = Field(..., description="FEN notation after the move")
    evaluation_before: float = Field(..., description="Position evaluation before the move")
    evaluation_after: float = Field(..., description="Position evaluation after the move")
    evaluation_change: float = Field(..., description="Change in evaluation")
    classification: str = Field(..., description="Move classification")
    is_best_move: bool = Field(..., description="Whether this was the best move")
    is_book_move: bool = Field(False, description="Whether this is a book move")

class GameAnnotationResponse(BaseModel):
    """Response model for game annotation."""
    game_id: str = Field(..., description="Game ID")
    total_moves: int = Field(..., description="Total number of moves in the game")
    annotations: List[MoveAnnotation] = Field(..., description="List of move annotations")

class BatchAnnotationRequest(BaseModel):
    """Request model for batch processing unannotated games."""
    limit: int = Field(10, description="Maximum number of games to process", ge=1, le=50)

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
            legal_moves=legal_moves
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
            request.fen, 
            skill_level=request.skill_level,
            move_time=request.move_time
        )
        
        if not result["move"]:
            raise HTTPException(status_code=400, detail="No legal moves available")
            
        return BestMoveResponse(
            move=result["move"],
            evaluation=result["evaluation"],
            is_mate=result["is_mate"],
            mate_in=result["mate_in"]
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")

@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_position(request: EvaluationRequest):
    """
    Evaluate a chess position.
    
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
            best_move=result["best_move"]
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
        "is_game_over": False
    }

@router.post("/{game_id}/annotate", response_model=GameAnnotationResponse)
async def annotate_game(
    game_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Analyze and annotate a specific chess game.
    
    Args:
        game_id: ID of the game to annotate
        user_id: Current authenticated user
        
    Returns:
        GameAnnotationResponse: The annotated game with move classifications
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, 
            detail="Authentication required to annotate games"
        )
    
    supabase = get_supabase_client()
    
    try:
        # Get the game from the database
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()
        
        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, 
                detail=f"Game with ID {game_id} not found"
            )
            
        game = game_response.data[0]
        
        # Check if game belongs to the user
        if game.get("user_id") != user_id:
            raise HTTPException(
                status_code=403, 
                detail="You don't have permission to annotate this game"
            )
            
        # Check if the game is already annotated
        if game.get("analyzed", False):
            # If already annotated, just return the existing annotations
            annotations_response = supabase.table("move_annotations").select("*").eq("game_id", game_id).order("move_number").execute()
            
            if len(annotations_response.data) == 0:
                # This is an inconsistent state - game marked as analyzed but no annotations
                logging.warning(f"Game {game_id} marked as analyzed but has no annotations. Proceeding with annotation.")
            else:
                return GameAnnotationResponse(
                    game_id=game_id,
                    total_moves=len(annotations_response.data),
                    annotations=annotations_response.data
                )
        
        # Parse the PGN
        pgn = game.get("pgn") or game.get("moves_only", "")
        if not pgn:
            raise HTTPException(
                status_code=400, 
                detail="Game does not contain valid PGN data required for annotation"
            )
            
        # Parse the game
        try:
            chess_game = chess.pgn.read_game(io.StringIO(pgn))
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid PGN format: {str(e)}"
            )
            
        if not chess_game:
            raise HTTPException(
                status_code=400, 
                detail="Invalid or empty PGN data"
            )
            
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
                evaluation_before = position_before["evaluation"]
            except Exception as e:
                logging.error(f"Error evaluating position before move {move_uci}: {str(e)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Engine error during position evaluation: {str(e)}"
                )
            
            # Make the move
            board.push(move)
            
            # Get position after the move
            fen_after = board.fen()
            try:
                position_after = await stockfish_service.evaluate_position(fen_after)
                evaluation_after = position_after["evaluation"]
            except Exception as e:
                logging.error(f"Error evaluating position after move {move_uci}: {str(e)}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Engine error during position evaluation: {str(e)}"
                )
            
            # Calculate evaluation change (from the perspective of the player making the move)
            if color == "black":
                # For black, a positive change means the position got better for black
                evaluation_change = -evaluation_after - (-evaluation_before)
            else:
                # For white, a positive change means the position got better for white
                evaluation_change = evaluation_after - evaluation_before
            
            # Classify the move based on evaluation change
            classification = classify_move(evaluation_change)
            
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
                "is_book_move": False  # Not implementing book detection yet
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
            supabase.table("games").update({"analyzed": True}).eq("id", game_id).execute()
        except Exception as e:
            logging.error(f"Database error while storing annotations: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to store annotations in database: {str(e)}"
            )
        
        # Format the response
        return GameAnnotationResponse(
            game_id=game_id,
            total_moves=len(move_annotations),
            annotations=move_annotations
        )
    except HTTPException:
        # Re-raise HTTP exceptions as they're already formatted
        raise
    except Exception as e:
        logging.error(f"Unexpected error annotating game {game_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error annotating game: {str(e)}"
        )

@router.post("/process-unannotated", response_model=BatchAnnotationResponse)
async def process_unannotated_games(
    request: BatchAnnotationRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Process a batch of unannotated games.
    
    Args:
        request: Batch processing request with limit
        user_id: Current authenticated user
        
    Returns:
        BatchAnnotationResponse: Summary of processed games
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, 
            detail="Authentication required to process games"
        )
        
    supabase = get_supabase_client()
    
    try:
        # Get unannotated games
        games_response = supabase.table("games").select("id").eq("analyzed", False).limit(request.limit).execute()
        
        if len(games_response.data) == 0:
            return BatchAnnotationResponse(
                processed_games=0,
                game_ids=[]
            )
            
        processed_game_ids = []
        failed_game_ids = []
        
        # Process each game
        for game_data in games_response.data:
            game_id = game_data["id"]
            
            try:
                # Use the annotate_game endpoint for each game
                await annotate_game(game_id=game_id, user_id=user_id)
                processed_game_ids.append(game_id)
            except HTTPException as e:
                logging.warning(f"Skipped processing game {game_id}: {e.detail}")
                failed_game_ids.append({"id": game_id, "reason": e.detail})
                continue
            except Exception as e:
                logging.error(f"Error processing game {game_id}: {str(e)}")
                failed_game_ids.append({"id": game_id, "reason": str(e)})
                # Continue with the next game
                continue
        
        if len(failed_game_ids) > 0:
            logging.info(f"Batch processing completed with {len(processed_game_ids)} successes and {len(failed_game_ids)} failures")
        
        return BatchAnnotationResponse(
            processed_games=len(processed_game_ids),
            game_ids=processed_game_ids
        )
    except Exception as e:
        logging.error(f"Error in batch processing: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error in batch processing: {str(e)}"
        )

@router.get("/{game_id}/annotations", response_model=List[MoveAnnotation])
async def get_game_annotations(
    game_id: str,
    user_id: str = Depends(get_current_user)
):
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
            status_code=401, 
            detail="Authentication required to access game annotations"
        )
        
    supabase = get_supabase_client()
    
    try:
        # First check if the game belongs to the user
        game_response = supabase.table("games").select("user_id").eq("id", game_id).execute()
        
        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, 
                detail=f"Game with ID {game_id} not found"
            )
            
        game = game_response.data[0]
        if game["user_id"] != user_id:
            raise HTTPException(
                status_code=403, 
                detail="You don't have permission to access annotations for this game"
            )
            
        # Get the annotations
        annotations_response = supabase.table("move_annotations").select("*").eq("game_id", game_id).order("move_number").execute()
        
        if len(annotations_response.data) == 0:
            # Check if the game is marked as analyzed
            game_check = supabase.table("games").select("analyzed").eq("id", game_id).execute()
            if game_check.data[0].get("analyzed", False):
                logging.warning(f"Game {game_id} is marked as analyzed but has no annotations")
                return []
            else:
                # Game isn't analyzed yet
                raise HTTPException(
                    status_code=404, 
                    detail=f"Game with ID {game_id} has not been analyzed yet"
                )
        
        return annotations_response.data
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logging.error(f"Error retrieving annotations for game {game_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error retrieving annotations: {str(e)}"
        )

@router.post("/even-move", response_model=EvenMoveResponse)
async def get_even_move(request: EvenMoveRequest):
    """
    Get a move that attempts to restore the previous evaluation difference rather than maximizing advantage.
    This is ideal for beginner-friendly responses that don't immediately punish mistakes.
    
    Args:
        request: Even move request with FEN, evaluation change, and options
        
    Returns:
        EvenMoveResponse: Selected move that aims for the target evaluation
    """
    try:
        board = chess.Board(request.fen)
        
        # If game is already over, return error
        if board.is_game_over():
            raise HTTPException(status_code=400, detail="Game is already over")
            
        # Get current position evaluation
        current_eval_result = await stockfish_service.evaluate_position(request.fen)
        current_eval = current_eval_result["evaluation"]
        
        # Calculate target evaluation (add eval_change to current evaluation)
        # If player blundered (negative eval_change), we aim for a less crushing response
        target_eval = current_eval + request.eval_change
        
        # Get all legal moves
        legal_moves = list(board.legal_moves)
        
        if not legal_moves:
            raise HTTPException(status_code=400, detail="No legal moves available")
            
        # Find the move that results in evaluation closest to target
        best_move = None
        best_eval = None
        best_eval_diff = float('inf')
        
        # For each legal move, evaluate the resulting position
        for move in legal_moves:
            # Make the move on a copy of the board
            temp_board = board.copy()
            temp_board.push(move)
            
            # Get evaluation after move
            move_result = await stockfish_service.evaluate_position(
                temp_board.fen(),
                skill_level=request.skill_level
            )
            
            # Get evaluation from engine's perspective and convert to our perspective
            # We need to negate here since evaluations flip between moves
            move_eval = -move_result["evaluation"]
            
            # Calculate difference from target
            eval_diff = abs(move_eval - target_eval)
            
            # If this move is closer to target than any previous move, save it
            if eval_diff < best_eval_diff:
                best_eval_diff = eval_diff
                best_move = move
                best_eval = move_eval
        
        if not best_move:
            # Fallback to best move if we couldn't find a suitable move
            best_move_result = await stockfish_service.get_best_move(
                request.fen, 
                skill_level=request.skill_level,
                move_time=request.move_time
            )
            best_move = chess.Move.from_uci(best_move_result["move"])
            best_eval = best_move_result["evaluation"]
            best_eval_diff = abs(best_eval - target_eval)
            
        return EvenMoveResponse(
            move=best_move.uci(),
            evaluation=best_eval,
            target_eval=target_eval,
            eval_difference=best_eval_diff
        )
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN format")
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