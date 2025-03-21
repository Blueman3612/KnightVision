import asyncio
import os
import chess
import chess.engine
from typing import Dict, List, Optional, Tuple, Union
import logging
from pydantic import BaseModel
import concurrent.futures

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
        self._engine_pool = []
        self._max_engines = 6  # Maximum number of engine instances to create
        self._engine_locks = []  # Locks to control access to each engine
        
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
        
    async def _get_engine_from_pool(self, index: int = 0) -> Tuple[chess.engine.SimpleEngine, asyncio.Lock]:
        """
        Get an engine from the pool or create a new one if needed.
        
        Args:
            index: Index of the engine to get (creates a new one if it doesn't exist)
            
        Returns:
            A tuple of (Stockfish engine instance, lock for that engine)
        """
        # Create engine pool up to max_engines if needed
        while len(self._engine_pool) <= index and len(self._engine_pool) < self._max_engines:
            try:
                transport, engine = await chess.engine.popen_uci(self.engine_path)
                await engine.configure({"Threads": max(1, self.threads // self._max_engines)})
                self._engine_pool.append(engine)
                self._engine_locks.append(asyncio.Lock())
                logger.info(f"Created engine instance {len(self._engine_pool)}")
            except Exception as e:
                logger.error(f"Failed to initialize engine for pool: {e}")
                raise RuntimeError(f"Failed to initialize engine for pool: {e}")
                
        # Return the requested engine or the last one if index is out of bounds
        idx = min(index, len(self._engine_pool) - 1)
        return self._engine_pool[idx], self._engine_locks[idx]
        
    async def close(self):
        """Close all Stockfish engine instances."""
        if self._engine:
            await self._engine.quit()
            self._engine = None
            
        # Close all engines in the pool
        for engine in self._engine_pool:
            await engine.quit()
        self._engine_pool.clear()
        self._engine_locks.clear()
    
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
    
    async def evaluate_position(self, fen: str, depth: Optional[int] = None, engine_index: int = 0) -> Dict:
        """
        Evaluate a chess position.
        
        Args:
            fen: FEN notation of the position to evaluate
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH which is 12)
                   Note: A standard depth of 12 is used across all evaluations for consistency
            engine_index: Index of the engine to use from the pool
                 
        Returns:
            Dict with evaluation details
        """
        if engine_index == 0:
            # Use main engine
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
        else:
            # Use engine from pool with lock to prevent concurrent access
            engine, lock = await self._get_engine_from_pool(engine_index - 1)
            
            # Use lock to ensure only one analysis per engine at a time
            async with lock:
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
        
    async def get_best_move_at_depth(self, fen: str, depth: int = 20) -> Dict:
        """
        Get the best move for a position at a specific depth.
        
        Args:
            fen: FEN notation of the current position
            depth: Search depth (defaults to 20)
            
        Returns:
            Dict containing the best move and evaluation
        """
        engine = await self._get_engine()
        board = chess.Board(fen)
        
        # Set engine to maximum skill level
        await engine.configure({"Skill Level": 20})
        
        # Analyze position at specified depth
        limit = chess.engine.Limit(depth=depth)
        analysis = await engine.analyse(board, limit)
        
        # Extract score
        score = analysis["score"].relative.score(mate_score=10000)
        
        # Extract best move if available
        best_move = None
        if "pv" in analysis and analysis["pv"]:
            best_move = analysis["pv"][0].uci()
            
        return {
            "fen": fen,
            "best_move": best_move,
            "evaluation": score / 100.0,  # Convert centipawns to pawns
            "depth": depth,
            "is_mate": analysis["score"].relative.is_mate(),
            "mate_in": analysis["score"].relative.mate()
        }
    
    async def get_even_move(self, fen: str, eval_change: float, skill_level: int = 20, move_time: float = 1.0) -> Dict:
        """
        Find a move that attempts to restore the previous evaluation difference rather than 
        maximizing advantage. Uses a multi-phase approach with partial parallelism for better performance.
        
        Args:
            fen: FEN notation of the current position
            eval_change: Evaluation change from the player's previous move
            skill_level: Stockfish skill level (0-20)
            move_time: Time to calculate in seconds
            
        Returns:
            Dict containing the selected move and related data
        """
        # Use the main engine for initial evaluation and settings
        engine = await self._get_engine()
        board = chess.Board(fen)
        
        if board.is_game_over():
            raise ValueError("Game is already over")
            
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            raise ValueError("No legal moves available")
            
        # Step 1: Get the current position evaluation with main engine
        current_eval_result = await self.evaluate_position(fen)
        current_eval = current_eval_result["evaluation"]
        
        # Calculate target evaluation
        target_eval = current_eval + eval_change
        
        # Set skill level for all engines
        await engine.configure({"Skill Level": skill_level})
        
        # Ensure we have engine instances created
        for i in range(min(self._max_engines, len(legal_moves))):
            engine_from_pool, _ = await self._get_engine_from_pool(i)
            await engine_from_pool.configure({"Skill Level": skill_level})
        
        # Step 2: Phase 1 - Quick shallow evaluation of all moves to find candidates
        shallow_depth = 8  # Even faster evaluation
        candidates = []
        
        # Process moves in batches based on available engines
        for i in range(0, len(legal_moves), self._max_engines):
            batch = legal_moves[i:i + self._max_engines]
            tasks = []
            
            # Create tasks for this batch
            for j, move in enumerate(batch):
                # Create temporary board with the move
                temp_board = board.copy()
                temp_board.push(move)
                
                # Evaluate with engine from pool
                task = self.evaluate_position(temp_board.fen(), shallow_depth, j + 1)
                tasks.append((move, task))
            
            # Process this batch
            for move, task_obj in tasks:
                try:
                    # Wait for evaluation result
                    result = await task_obj
                    eval_val = -result["evaluation"]  # Negate for perspective flip
                    
                    # Calculate distance from target
                    eval_diff = abs(eval_val - target_eval)
                    
                    candidates.append({
                        "move": move,
                        "eval": eval_val,
                        "diff": eval_diff
                    })
                except Exception as e:
                    logger.error(f"Error evaluating move {move.uci()}: {str(e)}")
                    # Skip this move and continue with others
                    continue
        
        # Sort candidates by their difference from target (smaller is better)
        candidates.sort(key=lambda x: x["diff"])
        
        # Step 3: Phase 2 - Detailed evaluation of top candidates
        # Take the top few candidates for deeper evaluation
        num_top_candidates = min(3, len(candidates))  # Evaluate at most 3 moves at full depth
        top_candidates = candidates[:num_top_candidates]
        
        deep_results = []
        
        # Process top candidates in batches too
        for i in range(0, len(top_candidates), self._max_engines):
            batch = top_candidates[i:i + self._max_engines]
            tasks = []
            
            # Create tasks for this batch
            for j, candidate in enumerate(batch):
                move = candidate["move"]
                temp_board = board.copy()
                temp_board.push(move)
                
                # Evaluate with engine from pool
                task = self.evaluate_position(temp_board.fen(), None, j + 1)
                tasks.append((move, task))
            
            # Process this batch
            for move, task_obj in tasks:
                try:
                    # Wait for evaluation result
                    result = await task_obj
                    eval_val = -result["evaluation"]  # Negate for perspective flip
                    
                    # Calculate distance from target
                    eval_diff = abs(eval_val - target_eval)
                    
                    deep_results.append({
                        "move": move,
                        "eval": eval_val,
                        "diff": eval_diff
                    })
                except Exception as e:
                    logger.error(f"Error deep evaluating move {move.uci()}: {str(e)}")
                    # Skip this move and continue with others
                    continue
        
        # Find the best move from deep evaluation results
        if deep_results:
            best_result = min(deep_results, key=lambda x: x["diff"])
            
            best_move = best_result["move"]
            best_eval = best_result["eval"]
            best_eval_diff = best_result["diff"]
        else:
            # Fallback to best move if we couldn't find a suitable move
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