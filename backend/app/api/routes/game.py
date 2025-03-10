from fastapi import APIRouter, Depends, HTTPException, Body, Query
from pydantic import BaseModel, Field
import chess
from typing import Dict, List, Optional, Union
import uuid

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