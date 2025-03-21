from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from pydantic import BaseModel, Field


class SquareControl(BaseModel):
    """Model for tracking square control metrics."""

    white_control: List[List[int]] = Field(
        default_factory=lambda: [[0 for _ in range(8)] for _ in range(8)]
    )
    black_control: List[List[int]] = Field(
        default_factory=lambda: [[0 for _ in range(8)] for _ in range(8)]
    )
    white_control_material: List[List[int]] = Field(
        default_factory=lambda: [[0 for _ in range(8)] for _ in range(8)]
    )
    black_control_material: List[List[int]] = Field(
        default_factory=lambda: [[0 for _ in range(8)] for _ in range(8)]
    )
    white_legal_moves: Dict[str, List[str]] = Field(default_factory=dict)
    black_legal_moves: Dict[str, List[str]] = Field(default_factory=dict)


class TacticalMotif(BaseModel):
    """Model for a detected tactical pattern."""

    motif_type: str  # "fork", "pin", "skewer", "discovered_check"
    piece: str  # Piece performing the tactic
    piece_square: str  # Square of the piece doing the tactic
    targets: List[str]  # Target squares/pieces
    move: str  # The move that created the tactic (UCI format)
    description: str  # Human-readable description


class PositionAnalysis(BaseModel):
    """Enhanced position analysis with tactical motifs and square control."""

    fen: str
    evaluation: float
    depth: int
    is_mate: bool
    mate_in: Optional[int] = None
    best_move: Optional[str] = None
    square_control: SquareControl
    tactical_motifs: List[TacticalMotif] = Field(default_factory=list)
    critical_squares: List[Tuple[str, str]] = Field(
        default_factory=list
    )  # [(square, description)]


class MoveAnalysis(BaseModel):
    """Enhanced move analysis with tactical annotations."""

    move_uci: str
    move_san: str
    move_number: int
    fen_before: str
    fen_after: str
    evaluation_before: float
    evaluation_after: float
    evaluation_change: float
    classification: str
    is_best_move: bool
    is_book_move: bool
    best_move: Optional[str] = None  # Stockfish's calculated best move at depth 20
    tactical_motifs: List[TacticalMotif] = Field(default_factory=list)
    square_control_before: SquareControl
    square_control_after: SquareControl
    move_improvement: Optional[str] = None  # Suggestion for improvement


class GameAnalysisResult(BaseModel):
    """Complete game analysis with tactical and positional insights."""

    game_id: str
    total_moves: int
    annotations: List[MoveAnalysis]
    player_weaknesses: Dict[str, List[int]] = Field(
        default_factory=lambda: {
            "tactical": [],
            "positional": [],
            "opening": [],
            "endgame": [],
        }
    )
    critical_positions: List[int] = Field(
        default_factory=list
    )  # List of move numbers where game shifted significantly
    transaction_successful: bool = Field(
        default=True
    )  # Flag indicating if database transaction was successful
    transaction_error: Optional[str] = None  # Error message if transaction failed
