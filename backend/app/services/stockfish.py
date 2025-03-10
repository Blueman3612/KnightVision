import asyncio
import os
import chess
import chess.engine
from typing import Dict, List, Optional, Tuple, Union
import logging
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

class StockfishService:
    """Service for interacting with the Stockfish chess engine."""
    
    def __init__(self):
        """Initialize the Stockfish service."""
        self.engine_path = settings.STOCKFISH_PATH
        self.depth = settings.STOCKFISH_DEPTH
        self.threads = settings.STOCKFISH_THREADS
        self._engine = None
        
    async def _get_engine(self) -> chess.engine.SimpleEngine:
        """Get or create a Stockfish engine instance."""
        if self._engine is None:
            try:
                transport, engine = await chess.engine.popen_uci(self.engine_path)
                self._engine = engine
                await self._engine.configure({"Threads": self.threads})
            except Exception as e:
                logger.error(f"Failed to initialize Stockfish engine: {e}")
                raise RuntimeError(f"Failed to initialize Stockfish engine: {e}")
        return self._engine
        
    async def close(self):
        """Close the Stockfish engine."""
        if self._engine:
            await self._engine.quit()
            self._engine = None
    
    async def get_best_move(self, fen: str, skill_level: int = 20, move_time: float = 1.0) -> Dict:
        """
        Get the best move for a given position with configurable strength.
        
        Args:
            fen: FEN notation of the current position
            skill_level: Stockfish skill level (0-20, where 20 is strongest)
            move_time: Time to calculate in seconds
            
        Returns:
            Dict containing the best move and evaluation
        """
        engine = await self._get_engine()
        board = chess.Board(fen)
        
        # Adjust engine strength based on skill level
        await engine.configure({"Skill Level": skill_level})
        
        # Calculate the best move
        limit = chess.engine.Limit(time=move_time)
        result = await engine.play(board, limit)
        
        # Get evaluation
        analysis = await engine.analyse(board, limit)
        score = analysis["score"].relative.score(mate_score=10000)
        
        return {
            "move": result.move.uci() if result.move else None,
            "evaluation": score / 100.0,  # Convert centipawns to pawns
            "is_mate": analysis["score"].relative.is_mate(),
            "mate_in": analysis["score"].relative.mate(),
        }
    
    async def evaluate_position(self, fen: str, depth: Optional[int] = None) -> Dict:
        """
        Evaluate a chess position.
        
        Args:
            fen: FEN notation of the position to evaluate
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH)
            
        Returns:
            Dict with evaluation details
        """
        engine = await self._get_engine()
        board = chess.Board(fen)
        
        # Set search depth
        search_depth = depth or self.depth
        limit = chess.engine.Limit(depth=search_depth)
        
        # Analyze position
        analysis = await engine.analyse(board, limit)
        score = analysis["score"].relative.score(mate_score=10000)
        
        return {
            "fen": fen,
            "evaluation": score / 100.0,  # Convert centipawns to pawns
            "depth": search_depth,
            "is_mate": analysis["score"].relative.is_mate(),
            "mate_in": analysis["score"].relative.mate(),
            "best_move": analysis.get("pv", [None])[0].uci() if "pv" in analysis and analysis["pv"] else None,
        }
    
    async def analyze_game(self, pgn: str, depth: Optional[int] = None) -> List[Dict]:
        """
        Analyze a complete game from PGN.
        
        Args:
            pgn: PGN notation of the game
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH)
            
        Returns:
            List of position evaluations for each move
        """
        game = chess.pgn.read_game(chess.io.StringIO(pgn))
        if not game:
            raise ValueError("Invalid PGN format")
        
        board = game.board()
        evaluations = []
        
        for move in game.mainline_moves():
            position_fen = board.fen()
            eval_before = await self.evaluate_position(position_fen, depth)
            
            # Execute the move
            board.push(move)
            
            evaluations.append({
                "move": move.uci(),
                "fen_before": position_fen,
                "fen_after": board.fen(),
                "evaluation": eval_before,
            })
        
        return evaluations
        
    async def set_skill_level(self, skill_level: int) -> None:
        """
        Set the skill level of the engine.
        
        Args:
            skill_level: Skill level (0-20, where 20 is strongest)
        """
        if not 0 <= skill_level <= 20:
            raise ValueError("Skill level must be between 0 and 20")
            
        engine = await self._get_engine()
        await engine.configure({"Skill Level": skill_level})

# Create a single instance for reuse
stockfish_service = StockfishService() 