import chess
import chess.pgn
from typing import Dict, List, Optional, Tuple, Union
import io
import logging

from app.models.analysis import SquareControl, TacticalMotif, PositionAnalysis, MoveAnalysis, GameAnalysisResult
from app.services.stockfish import stockfish_service
from app.services.tactics import tactics_service

# Configure logging
logger = logging.getLogger(__name__)

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

class AnalysisService:
    """Enhanced chess position and game analysis service."""
    
    async def analyze_position(self, fen: str, depth: Optional[int] = None) -> PositionAnalysis:
        """
        Analyze a chess position with enhanced metrics.
        
        Args:
            fen: FEN notation of the position to analyze
            depth: Search depth (defaults to settings.STOCKFISH_DEPTH)
            
        Returns:
            PositionAnalysis: Detailed position analysis with square control metrics
        """
        try:
            # Get basic stockfish evaluation
            basic_eval = await stockfish_service.evaluate_position(fen, depth)
            
            # Create board from FEN
            board = chess.Board(fen)
            
            # Calculate square control
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
                critical_squares=[]
            )
            
            # If there's a best move, check for potential tactics
            if basic_eval["best_move"]:
                try:
                    # Make a copy of the board
                    future_board = board.copy()
                    
                    # Parse and execute the best move
                    best_move = chess.Move.from_uci(basic_eval["best_move"])
                    
                    # Create the board after the move
                    board_before_move = board.copy()
                    future_board.push(best_move)
                    
                    # Analyze tactics that would result from the best move
                    tactics = tactics_service.analyze_move_for_tactics(board_before_move, future_board, best_move)
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
    
    async def analyze_game(self, pgn: str, depth: Optional[int] = None, 
                         game_id: Optional[str] = None) -> GameAnalysisResult:
        """
        Analyze a complete game with enhanced tactical and positional insights.
        
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
            
            # Player weaknesses tracking
            player_weaknesses = {
                "tactical": [],  # List of move numbers with tactical mistakes
                "positional": [],  # List of move numbers with positional mistakes
                "opening": [],  # List of opening mistakes (first 10-15 moves)
                "endgame": []  # List of endgame mistakes
            }
            
            # Critical positions tracking
            critical_positions = []
            
            # Process each move in the game
            for node in game.mainline():
                move = node.move
                move_san = board.san(move)
                move_uci = move.uci()
                color = "white" if board.turn == chess.WHITE else "black"
                
                logger.info(f"Analyzing move {move_number} ({color}): {move_san}")
                
                # Get position before the move
                fen_before = board.fen()
                
                # Get enhanced position analysis before the move
                try:
                    position_before = await self.analyze_position(fen_before, depth)
                    # Convert evaluation to white's perspective if it's black's turn
                    if not board.turn:  # False means it's black's turn
                        logger.info(f"Move {move_number} ({color}): Converting evaluation from {position_before.evaluation} to {-position_before.evaluation} (black to move)")
                        evaluation_before = -position_before.evaluation
                    else:
                        logger.info(f"Move {move_number} ({color}): Keeping evaluation as {position_before.evaluation} (white to move)")
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
                        square_control=default_control
                    )
                    evaluation_before = 0.0
                    square_control_before = default_control
                
                # Create copies of the board for before and after
                board_copy_before = chess.Board(fen_before)
                
                # Make the move
                board.push(move)
                
                # Get position after the move
                fen_after = board.fen()
                board_copy_after = chess.Board(fen_after)
                
                # Get enhanced position analysis after the move
                try:
                    position_after = await self.analyze_position(fen_after, depth)
                    # Convert evaluation to white's perspective if it's black's turn
                    if not board_copy_after.turn:  # False means it's black's turn
                        logger.info(f"Move {move_number} ({color}) after: Converting evaluation from {position_after.evaluation} to {-position_after.evaluation} (black to move)")
                        evaluation_after = -position_after.evaluation
                    else:
                        logger.info(f"Move {move_number} ({color}) after: Keeping evaluation as {position_after.evaluation} (white to move)")
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
                        square_control=default_control
                    )
                    evaluation_after = 0.0
                    square_control_after = default_control
                
                # Calculate evaluation change (always from white's perspective for storage)
                evaluation_change = evaluation_after - evaluation_before
                logger.info(f"Move {move_number} ({color}): Evaluation change from {evaluation_before} to {evaluation_after} = {evaluation_change} (white's perspective)")
                
                # For classification, adjust based on whose move it was
                if color == "black":
                    classification_change = -evaluation_change  # Negate for black's perspective
                    logger.info(f"Move {move_number} ({color}): Classification change = {classification_change} (black's perspective)")
                else:
                    classification_change = evaluation_change
                    logger.info(f"Move {move_number} ({color}): Classification change = {classification_change} (white's perspective)")
                    
                # Classify the move
                classification = classify_move(classification_change)
                
                # Check if this was the best move
                is_best_move = position_before.best_move == move_uci if position_before.best_move else False
                
                # Get the best move at depth 20
                best_move_depth20 = None
                try:
                    # Calculate best move at depth 20 for the position before the move
                    best_move_result = await stockfish_service.get_best_move_at_depth(fen_before, 20)
                    best_move_depth20 = best_move_result["best_move"]
                    logger.info(f"Move {move_number} ({color}): Best move at depth 20 is {best_move_depth20}")
                except Exception as e:
                    logger.error(f"Error calculating best move at depth 20 for move {move_number} {color}: {e}")
                
                # Detect tactical motifs for this move
                try:
                    tactical_motifs = tactics_service.analyze_move_for_tactics(board_copy_before, board_copy_after, move)
                except Exception as e:
                    logger.error(f"Error detecting tactics for move {move_number} {color}: {e}")
                    tactical_motifs = []
                
                # Create move annotation
                move_analysis = MoveAnalysis(
                    move_uci=move_uci,
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
                    square_control_after=square_control_after
                )
                
                # Track player weaknesses
                if classification in ["mistake", "blunder"]:
                    # Determine the phase of the game
                    piece_count = len(board.piece_map())
                    
                    if move_number <= 10:
                        # Opening phase
                        player_weaknesses["opening"].append(move_number)
                    elif piece_count <= 10:
                        # Endgame phase (10 or fewer pieces)
                        player_weaknesses["endgame"].append(move_number)
                    
                    # Check if it's a tactical mistake
                    if tactical_motifs:
                        player_weaknesses["tactical"].append(move_number)
                    else:
                        # Positional weakness
                        player_weaknesses["positional"].append(move_number)
                
                # Track critical positions (large evaluation swings)
                if abs(evaluation_change) >= 1.5:
                    critical_positions.append(move_number)
                
                # Add to annotations
                annotations.append(move_analysis)
                
                # Increment move number when it's black's turn
                if color == "black":
                    move_number += 1
            
            # Create game analysis result
            game_analysis = GameAnalysisResult(
                game_id=game_id,
                total_moves=len(annotations),
                annotations=annotations,
                player_weaknesses=player_weaknesses,
                critical_positions=critical_positions
            )
            
            return game_analysis
        except Exception as e:
            logger.error(f"Error in analyze_game: {e}")
            raise

# Create singleton instance
analysis_service = AnalysisService()