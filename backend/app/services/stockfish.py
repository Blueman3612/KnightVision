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
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH which is 12)
                   Note: A standard depth of 12 is used across all evaluations for consistency
                 
        Returns:
            Dict with evaluation details
        """
        engine = await self._get_engine()
        board = chess.Board(fen)
        
        # Set search depth - standardized to 12 by default in config
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
    
    async def get_even_move(self, fen: str, eval_change: float, skill_level: int = 20, move_time: float = 1.0) -> Dict:
        """
        Find a move that attempts to restore the previous evaluation difference rather than 
        maximizing advantage. Uses a two-phase evaluation approach for better performance.
        
        Args:
            fen: FEN notation of the current position
            eval_change: Evaluation change from the player's previous move
            skill_level: Stockfish skill level (0-20)
            move_time: Time to calculate in seconds
            
        Returns:
            Dict containing the selected move and related data
        """
        engine = await self._get_engine()
        board = chess.Board(fen)
        
        if board.is_game_over():
            raise ValueError("Game is already over")
            
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            raise ValueError("No legal moves available")
            
        # Step 1: Get the current position evaluation
        current_eval_result = await self.evaluate_position(fen)
        current_eval = current_eval_result["evaluation"]
        
        # Calculate target evaluation
        target_eval = current_eval + eval_change
        
        # Set skill level for evaluations
        await engine.configure({"Skill Level": skill_level})
        
        # Step 2: Phase 1 - Quick shallow evaluation of all moves to find candidates
        # Use a much shallower depth for initial screening
        shallow_depth = 4  # Much faster evaluation
        candidates = []
        
        for move in legal_moves:
            # Make the move
            temp_board = board.copy()
            temp_board.push(move)
            
            # Quick shallow evaluation
            limit = chess.engine.Limit(depth=shallow_depth)
            analysis = await engine.analyse(temp_board, limit)
            score = analysis["score"].relative.score(mate_score=10000)
            eval_val = -score / 100.0  # Convert centipawns to pawns and negate (perspective flip)
            
            # Calculate distance from target
            eval_diff = abs(eval_val - target_eval)
            
            # Add to candidates list
            candidates.append({
                "move": move,
                "eval": eval_val,
                "diff": eval_diff
            })
        
        # Sort candidates by their difference from target (smaller is better)
        candidates.sort(key=lambda x: x["diff"])
        
        # Step 3: Phase 2 - Detailed evaluation of top candidates
        # Take the top few candidates for deeper evaluation
        num_top_candidates = min(5, len(candidates))  # Evaluate at most 5 moves at full depth
        top_candidates = candidates[:num_top_candidates]
        
        best_move = None
        best_eval = None
        best_eval_diff = float('inf')
        
        # Perform deep evaluation on top candidates
        for candidate in top_candidates:
            move = candidate["move"]
            temp_board = board.copy()
            temp_board.push(move)
            
            # Full depth evaluation
            deep_result = await self.evaluate_position(temp_board.fen())
            deep_eval = -deep_result["evaluation"]  # Negate for perspective flip
            
            # Calculate difference from target
            deep_diff = abs(deep_eval - target_eval)
            
            # If this move is closer to target than our current best, save it
            if deep_diff < best_eval_diff:
                best_eval_diff = deep_diff
                best_move = move
                best_eval = deep_eval
        
        # If we couldn't find a suitable move through our optimization, fallback to best move
        if not best_move:
            best_move_result = await self.get_best_move(fen, skill_level, move_time)
            best_move = chess.Move.from_uci(best_move_result["move"])
            best_eval = best_move_result["evaluation"]
            best_eval_diff = abs(best_eval - target_eval)
            
        return {
            "move": best_move.uci(),
            "evaluation": best_eval,
            "target_eval": target_eval,
            "eval_difference": best_eval_diff
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