import io
import logging
from typing import Dict, List, Optional, Tuple, Union

import chess
import chess.pgn
from chess.pgn import (
    NAG_BLUNDER,
    NAG_BRILLIANT_MOVE,
    NAG_DUBIOUS_MOVE,
    NAG_GOOD_MOVE,
    NAG_MISTAKE,
    NAG_SPECULATIVE_MOVE,
)

from app.models.analysis import (
    GameAnalysisResult,
    MoveAnalysis,
    PositionAnalysis,
    SquareControl,
    TacticalMotif,
)
from app.services.stockfish import stockfish_service
from app.services.tactics import tactics_service

# Configure logging
logger = logging.getLogger(__name__)

# NAG (Numeric Annotation Glyph) to symbol mapping
NAG_SYMBOLS = {
    NAG_GOOD_MOVE: "!",  # Good move
    NAG_MISTAKE: "?",  # Mistake
    NAG_BRILLIANT_MOVE: "!!",  # Brilliant move
    NAG_BLUNDER: "??",  # Blunder
    NAG_SPECULATIVE_MOVE: "!?",  # Speculative move
    NAG_DUBIOUS_MOVE: "?!",  # Dubious move
}


def get_nag_for_evaluation_change(evaluation_change: float) -> int:
    """
    Convert evaluation change to appropriate NAG (Numeric Annotation Glyph).

    Args:
        evaluation_change: Change in evaluation in pawns

    Returns:
        int: NAG constant representing the move quality
    """
    if evaluation_change < -2.0:
        return NAG_BLUNDER  # ??
    elif evaluation_change < -1.0:
        return NAG_MISTAKE  # ?
    elif evaluation_change < -0.5:
        return NAG_DUBIOUS_MOVE  # ?!
    elif evaluation_change < 0.1:
        return NAG_GOOD_MOVE  # !
    elif evaluation_change < 0.5:
        return NAG_GOOD_MOVE  # !
    else:
        return NAG_BRILLIANT_MOVE  # !!


def classify_move(evaluation_change: float) -> str:
    """
    Classify a move based on evaluation change.

    Args:
        evaluation_change: Change in evaluation in pawns

    Returns:
        str: Classification (blunder, mistake, inaccuracy, good, great, excellent)
    """
    # Get NAG for this evaluation change
    nag = get_nag_for_evaluation_change(evaluation_change)

    # Map NAG to string classification (for backward compatibility)
    if nag == NAG_BLUNDER:
        return "blunder"
    elif nag == NAG_MISTAKE:
        return "mistake"
    elif nag == NAG_DUBIOUS_MOVE:
        return "inaccuracy"
    elif nag == NAG_GOOD_MOVE:
        return (
            "good" if evaluation_change < 0.1 else "great"
        )  # Distinguish between good and great
    elif nag == NAG_BRILLIANT_MOVE:
        return "excellent"
    else:
        return "good"  # Default case


def get_move_symbol(evaluation_change: float) -> str:
    """
    Get symbol annotation for move based on evaluation change.

    Args:
        evaluation_change: Change in evaluation in pawns

    Returns:
        str: Symbol ("!", "?", "!!", etc.)
    """
    nag = get_nag_for_evaluation_change(evaluation_change)
    return NAG_SYMBOLS.get(nag, "")


class AnalysisService:
    """Enhanced chess position and game analysis service."""

    async def analyze_position(
        self, fen: str, depth: Optional[int] = None
    ) -> PositionAnalysis:
        """
        Analyze a chess position with enhanced metrics.
        The analysis focuses exclusively on Stockfish's best move for tactical patterns,
        following the updated specification.

        Args:
            fen: FEN notation of the position to analyze
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH which is 20)

        Returns:
            PositionAnalysis: Detailed position analysis with square control metrics
        """
        try:
            logger.info(
                f"Analyzing position: {fen} at depth {depth or stockfish_service.depth}"
            )

            # Get basic stockfish evaluation at our standard depth
            basic_eval = await stockfish_service.evaluate_position(fen, depth)

            # Create board from FEN
            try:
                board = chess.Board(fen)
            except ValueError as e:
                logger.error(f"Invalid FEN format: {e}")
                raise ValueError(f"Invalid FEN format: {e}")

            # Calculate square control with optimized method
            square_control = tactics_service.calculate_square_control(board)

            # Initialize position analysis
            position_analysis = PositionAnalysis(
                fen=basic_eval["fen"],
                evaluation=basic_eval["evaluation"],
                depth=basic_eval["depth"],
                is_mate=basic_eval["is_mate"],
                mate_in=basic_eval["mate_in"],
                best_move=basic_eval["best_move"],
                square_control=square_control,
                tactical_motifs=[],
                critical_squares=[],
            )

            # We exclusively focus on Stockfish's best move for tactical patterns
            if basic_eval["best_move"]:
                try:
                    # Make a copy of the board
                    future_board = board.copy()

                    # Parse and execute the best move
                    best_move = chess.Move.from_uci(basic_eval["best_move"])

                    # Create the board after the move
                    board_before_move = board.copy()
                    future_board.push(best_move)

                    # Flag this as the best move (true by definition since it comes from Stockfish)
                    # This enforces our focus on only analyzing best moves for tactics
                    tactics = tactics_service.analyze_move_for_tactics(
                        board_before_move, future_board, best_move, is_best_move=True
                    )

                    if tactics:
                        logger.info(
                            f"Tactical motifs found in best move {best_move.uci()}: {len(tactics)}"
                        )

                    position_analysis.tactical_motifs = tactics
                except Exception as e:
                    logger.error(f"Error analyzing tactics for best move: {e}")
                    position_analysis.tactical_motifs = []

            # Identify critical squares (squares with big control imbalance)
            critical_squares = []
            for rank in range(8):
                for file in range(8):
                    white_control = square_control.white_control[rank][file]
                    black_control = square_control.black_control[rank][file]

                    # Check for significant imbalance
                    if abs(white_control - black_control) >= 2:
                        square_name = chess.square_name(chess.square(file, rank))
                        if white_control > black_control:
                            description = f"White control advantage (+{white_control - black_control})"
                        else:
                            description = f"Black control advantage (+{black_control - white_control})"

                        critical_squares.append((square_name, description))

            position_analysis.critical_squares = critical_squares

            return position_analysis
        except Exception as e:
            logger.error(f"Error in analyze_position: {e}")
            raise

    async def analyze_game(
        self, pgn: str, depth: Optional[int] = None, game_id: Optional[str] = None
    ) -> GameAnalysisResult:
        """
        Analyze a complete game with enhanced tactical and positional insights.
        Uses a tiered analysis approach to optimize performance.

        Args:
            pgn: PGN notation of the game
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH)
            game_id: Optional game ID

        Returns:
            GameAnalysisResult: Complete game analysis
        """
        try:
            # Parse the game
            game = chess.pgn.read_game(io.StringIO(pgn))
            if not game:
                raise ValueError("Invalid PGN format")

            # Get game ID
            game_id = game_id or game.headers.get("Event", "Unnamed Game")

            # Initialize board and annotations
            board = game.board()
            annotations = []
            move_number = 1
            
            # Track previous quick evaluation for detecting big changes
            prev_quick_eval = None
            
            # Set default full depth
            full_depth = depth or 20
            quick_depth = 10  # Reduced depth for quick scans
            
            # Track positions needing deep analysis
            critical_positions = []
            moves_to_analyze = []
            quick_scan_results = {}  # Store quick scan results

            # Player weaknesses tracking
            player_weaknesses = {
                "tactical": [],  # List of move numbers with tactical mistakes
                "positional": [],  # List of move numbers with positional mistakes
                "opening": [],  # List of opening mistakes (first 10-15 moves)
                "endgame": [],  # List of endgame mistakes
            }
            
            logger.info(f"Starting two-phase game analysis for game {game_id}")
            
            # PHASE 1: Quick scan to identify critical positions
            logger.info("PHASE 1: Quick scanning positions to identify critical ones")
            move_data = []  # Store move data for phase 2
            
            temp_board = chess.Board()
            quick_scan_move_number = 1
            
            # First pass - scan all positions at lower depth
            for node in game.mainline():
                move = node.move
                move_san = temp_board.san(move)
                move_uci = move.uci()
                color = "white" if temp_board.turn == chess.WHITE else "black"
                
                # Get position before the move
                fen_before = temp_board.fen()
                position_type = "standard"
                
                # Classify position using quick heuristics
                from app.services.stockfish import is_capture_position, is_check_position, is_central_move, get_game_phase
                
                # Check if this is a critical position based on move characteristics
                if is_capture_position(temp_board, move):
                    position_type = "critical"
                elif is_check_position(temp_board, move):
                    position_type = "critical"
                elif get_game_phase(temp_board) == "opening" and quick_scan_move_number <= 10:
                    position_type = "important"  # Opening theory
                elif get_game_phase(temp_board) == "endgame":
                    position_type = "critical"  # Endgames need accuracy
                
                # Do quick evaluation for standard positions
                if position_type == "standard" and prev_quick_eval is not None:
                    try:
                        # Quick scan at lower depth
                        quick_result = await stockfish_service.evaluate_position(fen_before, quick_depth)
                        current_eval = quick_result["evaluation"]
                        
                        # Convert to proper perspective
                        if not temp_board.turn:  # Black to move
                            current_eval = -current_eval
                            
                        # Check for significant evaluation change
                        if abs(current_eval - prev_quick_eval) >= 0.7:  # 0.7 pawns threshold
                            position_type = "critical"
                            
                        # Update for next iteration
                        prev_quick_eval = current_eval
                        
                        # Store result for reuse
                        quick_scan_results[fen_before] = quick_result
                    except Exception as e:
                        logger.error(f"Error in quick scan for move {quick_scan_move_number}: {e}")
                        # Default to critical if we can't evaluate
                        position_type = "critical"
                else:
                    # If it's the first move or already critical, do a quick scan
                    try:
                        quick_result = await stockfish_service.evaluate_position(fen_before, quick_depth)
                        current_eval = quick_result["evaluation"]
                        
                        # Convert to proper perspective
                        if not temp_board.turn:  # Black to move
                            current_eval = -current_eval
                            
                        prev_quick_eval = current_eval
                        quick_scan_results[fen_before] = quick_result
                    except Exception as e:
                        logger.error(f"Error in initial quick scan for move {quick_scan_move_number}: {e}")
                
                # Push move to advance board
                temp_board.push(move)
                fen_after = temp_board.fen()
                
                # Store move data for phase 2
                move_data.append({
                    "move": move,
                    "move_san": move_san,
                    "move_number": quick_scan_move_number,
                    "color": color,
                    "fen_before": fen_before,
                    "fen_after": fen_after,
                    "position_type": position_type
                })
                
                # Track critical positions for phase 2
                if position_type in ["critical", "important"]:
                    critical_positions.append(quick_scan_move_number)
                
                # Increment move number for black's move
                if color == "black":
                    quick_scan_move_number += 1
            
            logger.info(f"Quick scan complete - found {len(critical_positions)} critical positions out of {len(move_data)} moves")
            
            # PHASE 2: Detailed analysis of critical positions
            logger.info("PHASE 2: Detailed analysis of critical positions")
            
            # Reset board for full analysis
            board = game.board()
            move_number = 1
            
            # Process each move with appropriate depth
            for move_info in move_data:
                move = move_info["move"]
                move_san = move_info["move_san"]
                move_number = move_info["move_number"]
                color = move_info["color"]
                fen_before = move_info["fen_before"]
                fen_after = move_info["fen_after"]
                position_type = move_info["position_type"]

                # Determine appropriate depth
                position_depth = full_depth if position_type in ["critical", "important"] else quick_depth
                logger.info(f"Analyzing move {move_number} ({color}): {move_san} - {'CRITICAL' if position_type == 'critical' else position_type} position at depth {position_depth}")

                # Get enhanced position analysis before the move
                try:
                    # Check if we already have a quick scan result we can use
                    if position_depth == quick_depth and fen_before in quick_scan_results:
                        position_before = PositionAnalysis(
                            fen=fen_before,
                            evaluation=quick_scan_results[fen_before]["evaluation"],
                            depth=quick_scan_results[fen_before]["depth"],
                            is_mate=quick_scan_results[fen_before]["is_mate"],
                            mate_in=quick_scan_results[fen_before]["mate_in"],
                            best_move=quick_scan_results[fen_before]["best_move"],
                            square_control=tactics_service.calculate_square_control(chess.Board(fen_before)),
                            tactical_motifs=[],
                            critical_squares=[],
                        )
                    else:
                        # Full analysis needed
                        position_before = await self.analyze_position(fen_before, position_depth)
                    
                    # Convert evaluation to white's perspective if it's black's turn
                    board_before = chess.Board(fen_before)
                    if not board_before.turn:  # False means it's black's turn
                        evaluation_before = -position_before.evaluation
                    else:
                        evaluation_before = position_before.evaluation
                    
                    square_control_before = position_before.square_control
                    
                except Exception as e:
                    logger.error(f"Error analyzing position before move {move_number} {color}: {e}")
                    # Use a default position analysis for error recovery
                    default_board = chess.Board(fen_before)
                    default_control = tactics_service.calculate_square_control(default_board)
                    position_before = PositionAnalysis(
                        fen=fen_before,
                        evaluation=0.0,  # Neutral evaluation
                        depth=0,
                        is_mate=False,
                        square_control=default_control,
                    )
                    evaluation_before = 0.0
                    square_control_before = default_control

                # Create copies of the board for tactics analysis
                board_copy_before = chess.Board(fen_before)
                board_copy_after = chess.Board(fen_after)

                # Get enhanced position analysis after the move
                try:
                    # Check if we already have this position analyzed (might be from a previous 'before' state)
                    position_depth_after = full_depth if position_type in ["critical", "important"] else quick_depth
                    
                    if position_depth_after == quick_depth and fen_after in quick_scan_results:
                        position_after = PositionAnalysis(
                            fen=fen_after,
                            evaluation=quick_scan_results[fen_after]["evaluation"],
                            depth=quick_scan_results[fen_after]["depth"],
                            is_mate=quick_scan_results[fen_after]["is_mate"],
                            mate_in=quick_scan_results[fen_after]["mate_in"],
                            best_move=quick_scan_results[fen_after]["best_move"],
                            square_control=tactics_service.calculate_square_control(chess.Board(fen_after)),
                            tactical_motifs=[],
                            critical_squares=[],
                        )
                    else:
                        position_after = await self.analyze_position(fen_after, position_depth_after)
                    
                    # Convert evaluation to white's perspective if it's black's turn
                    board_after = chess.Board(fen_after)
                    if not board_after.turn:  # False means it's black's turn
                        evaluation_after = -position_after.evaluation
                    else:
                        evaluation_after = position_after.evaluation
                        
                    square_control_after = position_after.square_control
                    
                except Exception as e:
                    logger.error(f"Error analyzing position after move {move_number} {color}: {e}")
                    # Use a default position analysis for error recovery
                    default_board = chess.Board(fen_after)
                    default_control = tactics_service.calculate_square_control(default_board)
                    position_after = PositionAnalysis(
                        fen=fen_after,
                        evaluation=0.0,  # Neutral evaluation
                        depth=0,
                        is_mate=False,
                        square_control=default_control,
                    )
                    evaluation_after = 0.0
                    square_control_after = default_control

                # Calculate evaluation change (always from white's perspective for storage)
                evaluation_change = evaluation_after - evaluation_before
                logger.info(
                    f"Move {move_number} ({color}): Evaluation change from {evaluation_before} to {evaluation_after} = {evaluation_change} (white's perspective)"
                )

                # For classification, adjust based on whose move it was
                if color == "black":
                    classification_change = -evaluation_change  # Negate for black's perspective
                else:
                    classification_change = evaluation_change

                # Classify the move
                classification = classify_move(classification_change)

                # Check if this was the best move
                is_best_move = position_before.best_move == move.uci() if position_before.best_move else False

                # Get best move (preferably from position_before but calculate if needed)
                best_move_depth20 = None
                if position_type in ["critical", "important"]:
                    # For critical positions, always compute best move at depth 20 if not already done
                    if not position_before.best_move or position_before.depth < 18:
                        try:
                            best_move_result = await stockfish_service.get_best_move_at_depth(fen_before, 20)
                            best_move_depth20 = best_move_result["best_move"]
                        except Exception as e:
                            logger.error(f"Error calculating best move at depth 20 for move {move_number}: {e}")
                    else:
                        best_move_depth20 = position_before.best_move
                else:
                    # For standard positions, use what we have
                    best_move_depth20 = position_before.best_move
                
                # Tactical motif detection - only analyze critical positions at full detail
                tactical_motifs = []
                if position_type in ["critical", "important"]:
                    try:
                        tactical_motifs = tactics_service.analyze_move_for_tactics(
                            board_copy_before,
                            board_copy_after,
                            move,
                            is_best_move=is_best_move,
                        )
                        
                        # Log detected motifs
                        if tactical_motifs:
                            tactic_types = [t.motif_type for t in tactical_motifs]
                            logger.info(f"Move {move_number} ({color}): Detected {len(tactical_motifs)} tactical motifs: {tactic_types}")
                    except Exception as e:
                        logger.error(f"Error detecting tactics for move {move_number} {color}: {e}")
                        tactical_motifs = []

                # Create move annotation
                move_analysis = MoveAnalysis(
                    move_uci=move.uci(),
                    move_san=move_san,
                    move_number=move_number,
                    fen_before=fen_before,
                    fen_after=fen_after,
                    evaluation_before=evaluation_before,
                    evaluation_after=evaluation_after,
                    evaluation_change=evaluation_change,
                    classification=classification,
                    is_best_move=is_best_move,
                    is_book_move=False,  # Not implementing book detection yet
                    best_move=best_move_depth20,  # Best move calculated at depth 20
                    tactical_motifs=tactical_motifs,
                    square_control_before=square_control_before,
                    square_control_after=square_control_after,
                )

                # Track player weaknesses
                if classification in ["mistake", "blunder"]:
                    # Determine the phase of the game
                    game_phase = get_game_phase(board_copy_before)
                    
                    if game_phase == "opening":
                        player_weaknesses["opening"].append(move_number)
                    elif game_phase == "endgame":
                        player_weaknesses["endgame"].append(move_number)

                    # Check if it's a tactical mistake
                    if tactical_motifs:
                        player_weaknesses["tactical"].append(move_number)
                    else:
                        # Positional weakness
                        player_weaknesses["positional"].append(move_number)

                # Add to annotations
                annotations.append(move_analysis)
                
                # Move the board forward
                board.push(move)

            # Create game analysis result
            logger.info(f"Game analysis complete - analyzed {len(annotations)} moves ({len(critical_positions)} critical positions)")
            game_analysis = GameAnalysisResult(
                game_id=game_id,
                total_moves=len(annotations),
                annotations=annotations,
                player_weaknesses=player_weaknesses,
                critical_positions=critical_positions,
            )

            return game_analysis
        except Exception as e:
            logger.error(f"Error in analyze_game: {e}")
            raise


# Create singleton instance
analysis_service = AnalysisService()
