import asyncio
import concurrent.futures
import logging
import os
from typing import Dict, List, Optional, Tuple, Union

import chess
import chess.engine
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)


class StockfishService:
    """Service for interacting with the Stockfish chess engine."""

    def __init__(self):
        """Initialize the Stockfish service."""
        self.engine_path = settings.STOCKFISH_PATH
        self.depth = settings.STOCKFISH_DEPTH  # Standard depth 20 from config
        self.threads = settings.STOCKFISH_THREADS
        self._engine = None
        self._engine_pool = []
        self._max_engines = 6  # Maximum number of engine instances to create
        self._engine_locks = []  # Locks to control access to each engine

        # Position evaluation cache
        self._position_cache = {}  # Format: {fen_depth: evaluation_dict}
        self._cache_hits = 0
        self._cache_misses = 0
        self._max_cache_size = 10000  # Maximum number of positions to cache

    async def _get_engine(self) -> chess.engine.SimpleEngine:
        """Get or create a Stockfish engine instance."""
        if self._engine is None:
            try:
                # Check if the engine path exists
                if not os.path.exists(self.engine_path):
                    error_msg = (
                        f"Stockfish engine not found at path: {self.engine_path}"
                    )
                    logger.error(error_msg)
                    raise FileNotFoundError(error_msg)

                logger.info(f"Initializing Stockfish engine from {self.engine_path}")
                transport, engine = await chess.engine.popen_uci(self.engine_path)
                self._engine = engine

                try:
                    # Configure number of threads
                    await self._engine.configure({"Threads": self.threads})
                    logger.info(f"Engine configured with {self.threads} threads")

                    # Verify engine is working with a simple command
                    # Different python-chess versions have different ways to access engine options
                    # We'll just log basic initialization success without trying to get version info
                    logger.info(
                        f"Stockfish engine initialized successfully with {self.threads} threads"
                    )
                except Exception as config_err:
                    logger.error(
                        f"Engine initialized but configuration failed: {config_err}"
                    )
                    # Continue anyway since the engine is working
            except Exception as e:
                logger.error(f"Failed to initialize Stockfish engine: {e}")
                raise RuntimeError(f"Failed to initialize Stockfish engine: {e}")
        return self._engine

    async def _get_engine_from_pool(
        self, index: int = 0
    ) -> Tuple[chess.engine.SimpleEngine, asyncio.Lock]:
        """
        Get an engine from the pool or create a new one if needed.

        Args:
            index: Index of the engine to get (creates a new one if it doesn't exist)

        Returns:
            A tuple of (Stockfish engine instance, lock for that engine)
        """
        try:
            # Create engine pool up to max_engines if needed
            while (
                len(self._engine_pool) <= index
                and len(self._engine_pool) < self._max_engines
            ):
                try:
                    # Check if the engine path exists
                    if not os.path.exists(self.engine_path):
                        error_msg = (
                            f"Stockfish engine not found at path: {self.engine_path}"
                        )
                        logger.error(error_msg)
                        raise FileNotFoundError(error_msg)

                    # Calculate threads per engine - at least 1 thread
                    threads_per_engine = max(1, self.threads // self._max_engines)
                    logger.info(
                        f"Creating engine instance {len(self._engine_pool)+1} with {threads_per_engine} threads"
                    )

                    transport, engine = await chess.engine.popen_uci(self.engine_path)
                    await engine.configure({"Threads": threads_per_engine})

                    # Store engine and its lock
                    self._engine_pool.append(engine)
                    self._engine_locks.append(asyncio.Lock())
                    logger.info(
                        f"Created engine instance {len(self._engine_pool)} successfully"
                    )

                except Exception as e:
                    logger.error(f"Failed to initialize engine for pool: {e}")
                    # If there's at least one engine in the pool, we can continue
                    if len(self._engine_pool) > 0:
                        logger.warning("Using available engine instead")
                        break
                    raise RuntimeError(f"Failed to initialize engine for pool: {e}")

            # Check if we have any engines
            if not self._engine_pool:
                raise RuntimeError("No engines available in the pool")

            # Return the requested engine or the last one if index is out of bounds
            idx = min(index, len(self._engine_pool) - 1)
            return self._engine_pool[idx], self._engine_locks[idx]

        except Exception as e:
            logger.error(f"Error getting engine from pool: {e}")
            # Try to get the main engine as a fallback
            if self._engine is None:
                await self._get_engine()

            if self._engine:
                # Create a lock if needed
                if len(self._engine_locks) == 0:
                    self._engine_locks.append(asyncio.Lock())
                return self._engine, self._engine_locks[0]
            raise

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

    async def get_best_move(
        self, fen: str, skill_level: int = 20, move_time: float = 1.0
    ) -> Dict:
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

    async def evaluate_position(
        self, fen: str, depth: Optional[int] = None, engine_index: int = 0
    ) -> Dict:
        """
        Evaluate a chess position with caching.

        Args:
            fen: FEN notation of the position to evaluate
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH which is 20)
                   Note: A standard depth of 20 is used across all evaluations for consistency
            engine_index: Index of the engine to use from the pool

        Returns:
            Dict with evaluation details
        """
        try:
            # Normalize and clean up FEN
            try:
                board = chess.Board(fen)
                # Use a standardized FEN for caching to avoid duplicates
                normalized_fen = board.fen().split(" ")[
                    0
                ]  # Only use piece positions for cache key
            except ValueError as e:
                logger.error(f"Invalid FEN format: {fen}: {str(e)}")
                raise ValueError(f"Invalid FEN format: {str(e)}")

            # Set search depth - standardized to 20 by default in config
            search_depth = depth or self.depth

            # Create cache key
            cache_key = f"{normalized_fen}_{search_depth}"

            # Check cache first
            if cache_key in self._position_cache:
                self._cache_hits += 1
                logger.debug(
                    f"Cache hit for position {normalized_fen} at depth {search_depth} (hits: {self._cache_hits}, misses: {self._cache_misses})"
                )
                return self._position_cache[cache_key]

            # Cache miss, need to analyze the position
            self._cache_misses += 1

            if engine_index == 0:
                # Use main engine
                engine = await self._get_engine()

                # Analyze position
                try:
                    limit = chess.engine.Limit(depth=search_depth)
                    analysis = await engine.analyse(board, limit)
                    score = analysis["score"].relative.score(mate_score=10000)

                    # Get best move if available
                    best_move = None
                    if "pv" in analysis and analysis["pv"]:
                        best_move = analysis["pv"][0].uci()

                    # Create result
                    result = {
                        "fen": fen,
                        "evaluation": score / 100.0,  # Convert centipawns to pawns
                        "depth": search_depth,
                        "is_mate": analysis["score"].relative.is_mate(),
                        "mate_in": analysis["score"].relative.mate(),
                        "best_move": best_move,
                    }

                    # Store in cache
                    self._cache_position(cache_key, result)

                    return result
                except Exception as e:
                    logger.error(f"Analysis error for position {fen}: {str(e)}")
                    raise RuntimeError(f"Analysis engine error: {str(e)}")
            else:
                # Use engine from pool with lock to prevent concurrent access
                try:
                    engine, lock = await self._get_engine_from_pool(engine_index - 1)
                except Exception as e:
                    logger.error(f"Failed to get engine from pool: {str(e)}")
                    raise RuntimeError(f"Engine pool error: {str(e)}")

                # Use lock to ensure only one analysis per engine at a time
                async with lock:
                    # Analyze position
                    try:
                        limit = chess.engine.Limit(depth=search_depth)
                        analysis = await engine.analyse(board, limit)
                        score = analysis["score"].relative.score(mate_score=10000)

                        # Get best move if available
                        best_move = None
                        if "pv" in analysis and analysis["pv"]:
                            best_move = analysis["pv"][0].uci()

                        # Create result
                        result = {
                            "fen": fen,
                            "evaluation": score / 100.0,  # Convert centipawns to pawns
                            "depth": search_depth,
                            "is_mate": analysis["score"].relative.is_mate(),
                            "mate_in": analysis["score"].relative.mate(),
                            "best_move": best_move,
                        }

                        # Store in cache
                        self._cache_position(cache_key, result)

                        return result
                    except Exception as e:
                        logger.error(
                            f"Analysis error for position {fen} with engine {engine_index}: {str(e)}"
                        )
                        raise RuntimeError(f"Analysis engine error: {str(e)}")
        except Exception as e:
            # Final fallback for any unhandled exceptions
            logger.error(f"Unhandled exception in evaluate_position: {str(e)}")
            raise

    def _cache_position(self, cache_key: str, result: Dict) -> None:
        """
        Add a position evaluation to the cache with LRU management.

        Args:
            cache_key: Key for the position (fen_depth)
            result: Evaluation result to cache
        """
        # Implement simple LRU - remove oldest item if we're at capacity
        if len(self._position_cache) >= self._max_cache_size:
            # Remove random item (simple approach)
            # For a more sophisticated LRU, we would track access time
            try:
                # Get first key to remove
                key_to_remove = next(iter(self._position_cache))
                del self._position_cache[key_to_remove]
                logger.debug(f"Cache full, removed entry {key_to_remove}")
            except (StopIteration, KeyError):
                # This should never happen, but just in case
                logger.warning("Failed to remove item from cache")

        # Add new item to cache
        self._position_cache[cache_key] = result
        logger.debug(
            f"Added position to cache: {cache_key} (size: {len(self._position_cache)})"
        )

    async def get_best_move_at_depth(self, fen: str, depth: int = 20) -> Dict:
        """
        Get the best move for a position at a specific depth.
        Uses the evaluate_position method with caching.

        Args:
            fen: FEN notation of the current position
            depth: Search depth (defaults to 20 - our standard evaluation depth)

        Returns:
            Dict containing the best move and evaluation
        """
        try:
            # We now use evaluate_position since it has caching built in
            # This avoids duplicate code and ensures consistent caching
            return await self.evaluate_position(fen, depth)

        except Exception as e:
            # Final fallback for any unhandled exceptions
            logger.error(f"Unhandled exception in get_best_move_at_depth: {str(e)}")
            raise

    async def get_even_move(
        self,
        fen: str,
        eval_change: float,
        skill_level: int = 20,
        move_time: float = 1.0,
    ) -> Dict:
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
            batch = legal_moves[i : i + self._max_engines]
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

                    candidates.append(
                        {"move": move, "eval": eval_val, "diff": eval_diff}
                    )
                except Exception as e:
                    logger.error(f"Error evaluating move {move.uci()}: {str(e)}")
                    # Skip this move and continue with others
                    continue

        # Sort candidates by their difference from target (smaller is better)
        candidates.sort(key=lambda x: x["diff"])

        # Step 3: Phase 2 - Detailed evaluation of top candidates
        # Take the top few candidates for deeper evaluation
        num_top_candidates = min(
            3, len(candidates)
        )  # Evaluate at most 3 moves at full depth
        top_candidates = candidates[:num_top_candidates]

        deep_results = []

        # Process top candidates in batches too
        for i in range(0, len(top_candidates), self._max_engines):
            batch = top_candidates[i : i + self._max_engines]
            tasks = []

            # Create tasks for this batch
            for j, candidate in enumerate(batch):
                move = candidate["move"]
                temp_board = board.copy()
                temp_board.push(move)

                # Evaluate with engine from pool
                task = self.evaluate_position(temp_board.fen(), 12, j + 1)
                tasks.append((move, task))

            # Process this batch
            for move, task_obj in tasks:
                try:
                    # Wait for evaluation result
                    result = await task_obj
                    eval_val = -result["evaluation"]  # Negate for perspective flip

                    # Calculate distance from target
                    eval_diff = abs(eval_val - target_eval)

                    deep_results.append(
                        {"move": move, "eval": eval_val, "diff": eval_diff}
                    )
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
            "eval_difference": best_eval_diff,
        }

    async def analyze_game(self, pgn: str, depth: Optional[int] = None) -> List[Dict]:
        """
        Analyze a complete game from PGN.

        Args:
            pgn: PGN notation of the game
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH which is 20)

        Returns:
            List of position evaluations for each move
        """
        try:
            try:
                game = chess.pgn.read_game(chess.io.StringIO(pgn))
                if not game:
                    raise ValueError("Invalid PGN format or empty game")
            except Exception as e:
                logger.error(f"Invalid PGN format: {str(e)}")
                raise ValueError(f"Invalid PGN format: {str(e)}")

            board = game.board()
            evaluations = []
            move_count = 0

            for move in game.mainline_moves():
                move_count += 1
                position_fen = board.fen()

                try:
                    # Use standardized depth for all analyses
                    eval_before = await self.evaluate_position(position_fen, depth)

                    # Execute the move
                    board.push(move)

                    evaluations.append(
                        {
                            "move": move.uci(),
                            "move_number": move_count,
                            "fen_before": position_fen,
                            "fen_after": board.fen(),
                            "evaluation": eval_before,
                        }
                    )
                except Exception as e:
                    logger.error(
                        f"Error analyzing move {move_count} ({move.uci()}): {str(e)}"
                    )
                    # Continue with next move instead of failing the entire analysis
                    board.push(move)
                    evaluations.append(
                        {
                            "move": move.uci(),
                            "move_number": move_count,
                            "fen_before": position_fen,
                            "fen_after": board.fen(),
                            "evaluation": {"error": str(e)},
                        }
                    )

            logger.info(f"Game analysis complete - analyzed {move_count} moves")
            return evaluations

        except Exception as e:
            logger.error(f"Analysis game error: {str(e)}")
            raise

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
