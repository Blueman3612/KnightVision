import chess
import chess.pgn
from typing import Dict, List, Optional, Tuple, Any
import logging

from app.models.analysis import SquareControl, TacticalMotif

# Configure logging
logger = logging.getLogger(__name__)

# Standard piece values
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 0  # Not factored in material calculations
}

class TacticsService:
    """Service for detecting tactical patterns in chess positions."""
    
    def calculate_square_control(self, board: chess.Board) -> SquareControl:
        """
        Calculate square control metrics for a given board position.
        
        Args:
            board: Chess board position
            
        Returns:
            SquareControl object with metrics for each square
        """
        # Initialize data structures
        white_control = [[0 for _ in range(8)] for _ in range(8)]
        black_control = [[0 for _ in range(8)] for _ in range(8)]
        white_control_material = [[0 for _ in range(8)] for _ in range(8)]
        black_control_material = [[0 for _ in range(8)] for _ in range(8)]
        white_legal_moves = {}
        black_legal_moves = {}
        
        # For each piece on the board
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if not piece:
                continue
                
            # Get square name (e.g., "e4")
            square_name = chess.square_name(square)
            
            # Get all squares this piece attacks
            moves = []
            
            # Custom attack calculation to populate control metrics
            piece_type = piece.piece_type
            piece_color = piece.color
            square_file = chess.square_file(square)
            square_rank = chess.square_rank(square)
            
            # Calculate attacked squares based on piece type
            attacked_squares = []
            
            # Knight moves
            if piece_type == chess.KNIGHT:
                knight_moves = [
                    (2, 1), (1, 2), (-1, 2), (-2, 1),
                    (-2, -1), (-1, -2), (1, -2), (2, -1)
                ]
                for dx, dy in knight_moves:
                    new_file = square_file + dx
                    new_rank = square_rank + dy
                    if 0 <= new_file < 8 and 0 <= new_rank < 8:
                        to_square = chess.square(new_file, new_rank)
                        moves.append(chess.square_name(to_square))
                        attacked_squares.append((new_file, new_rank))
                        
            # King moves
            elif piece_type == chess.KING:
                king_moves = [
                    (1, 0), (1, 1), (0, 1), (-1, 1),
                    (-1, 0), (-1, -1), (0, -1), (1, -1)
                ]
                for dx, dy in king_moves:
                    new_file = square_file + dx
                    new_rank = square_rank + dy
                    if 0 <= new_file < 8 and 0 <= new_rank < 8:
                        to_square = chess.square(new_file, new_rank)
                        moves.append(chess.square_name(to_square))
                        attacked_squares.append((new_file, new_rank))
                        
            # Pawn captures
            elif piece_type == chess.PAWN:
                if piece_color == chess.WHITE:
                    pawn_attacks = [(1, 1), (-1, 1)]
                else:
                    pawn_attacks = [(1, -1), (-1, -1)]
                    
                for dx, dy in pawn_attacks:
                    new_file = square_file + dx
                    new_rank = square_rank + dy
                    if 0 <= new_file < 8 and 0 <= new_rank < 8:
                        to_square = chess.square(new_file, new_rank)
                        moves.append(chess.square_name(to_square))
                        attacked_squares.append((new_file, new_rank))
                        
            # Sliding pieces (bishop, rook, queen)
            else:
                directions = []
                
                # Bishop or Queen can move diagonally
                if piece_type in [chess.BISHOP, chess.QUEEN]:
                    directions.extend([(1, 1), (1, -1), (-1, 1), (-1, -1)])
                    
                # Rook or Queen can move orthogonally
                if piece_type in [chess.ROOK, chess.QUEEN]:
                    directions.extend([(1, 0), (0, 1), (-1, 0), (0, -1)])
                    
                for dx, dy in directions:
                    for dist in range(1, 8):  # Max distance is 7 squares
                        new_file = square_file + dx * dist
                        new_rank = square_rank + dy * dist
                        
                        if not (0 <= new_file < 8 and 0 <= new_rank < 8):
                            break
                            
                        to_square = chess.square(new_file, new_rank)
                        moves.append(chess.square_name(to_square))
                        attacked_squares.append((new_file, new_rank))
                        
                        # If there's a piece here, we can't go further in this direction
                        if board.piece_at(to_square) is not None:
                            break
                            
            # Update control metrics for all attacked squares
            for file_idx, rank_idx in attacked_squares:
                if piece_color == chess.WHITE:
                    white_control[rank_idx][file_idx] += 1
                    white_control_material[rank_idx][file_idx] += PIECE_VALUES[piece_type]
                else:
                    black_control[rank_idx][file_idx] += 1
                    black_control_material[rank_idx][file_idx] += PIECE_VALUES[piece_type]
            
            # Store legal moves
            if piece.color == chess.WHITE:
                white_legal_moves[square_name] = moves
            else:
                black_legal_moves[square_name] = moves
        
        # Create SquareControl object
        square_control = SquareControl(
            white_control=white_control,
            black_control=black_control,
            white_control_material=white_control_material,
            black_control_material=black_control_material,
            white_legal_moves=white_legal_moves,
            black_legal_moves=black_legal_moves
        )
        
        return square_control
    
    def detect_fork(self, board_before: chess.Board, board_after: chess.Board, move: chess.Move, 
                   control_before: SquareControl, control_after: SquareControl) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a fork.
        
        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move
            
        Returns:
            TacticalMotif if fork is detected, None otherwise
        """
        # Get the piece that moved
        piece = board_after.piece_at(move.to_square)
        if not piece:
            return None
            
        # Get all squares that are newly attacked after the move
        newly_attacked_pieces = []
        
        # Get all pieces of the opposite color
        opponent_color = not piece.color
        for square in chess.SQUARES:
            target_piece = board_after.piece_at(square)
            if not target_piece or target_piece.color == piece.color:
                continue
                
            # Check if this square is attacked by the moving piece
            # We need to check if this specific piece now attacks the target
            landing_square = move.to_square
            target_square = square
            
            # Check if the piece can attack based on piece type
            can_attack = False
            
            # Knight moves
            if piece.piece_type == chess.KNIGHT:
                rank_diff = abs(chess.square_rank(landing_square) - chess.square_rank(target_square))
                file_diff = abs(chess.square_file(landing_square) - chess.square_file(target_square))
                if (rank_diff == 1 and file_diff == 2) or (rank_diff == 2 and file_diff == 1):
                    can_attack = True
                    
            # Bishop/Queen diagonal moves
            elif piece.piece_type in [chess.BISHOP, chess.QUEEN]:
                rank_diff = chess.square_rank(landing_square) - chess.square_rank(target_square)
                file_diff = chess.square_file(landing_square) - chess.square_file(target_square)
                if abs(rank_diff) == abs(file_diff) and rank_diff != 0:  # Same diagonal and not same square
                    # Check if no pieces in between
                    direction_rank = -1 if rank_diff > 0 else 1
                    direction_file = -1 if file_diff > 0 else 1
                    
                    clear_path = True
                    steps = abs(rank_diff) - 1
                    
                    for step in range(1, steps + 1):
                        check_rank = chess.square_rank(landing_square) + step * direction_rank
                        check_file = chess.square_file(landing_square) + step * direction_file
                        check_square = chess.square(check_file, check_rank)
                        
                        if board_after.piece_at(check_square):
                            clear_path = False
                            break
                            
                    if clear_path:
                        can_attack = True
                        
            # Rook/Queen orthogonal moves
            elif piece.piece_type in [chess.ROOK, chess.QUEEN]:
                rank_diff = chess.square_rank(landing_square) - chess.square_rank(target_square)
                file_diff = chess.square_file(landing_square) - chess.square_file(target_square)
                
                if (rank_diff == 0 or file_diff == 0) and not (rank_diff == 0 and file_diff == 0):  # Same rank or file but not same square
                    # Check if no pieces in between
                    clear_path = True
                    
                    if rank_diff == 0:  # Same rank
                        direction = -1 if file_diff > 0 else 1
                        steps = abs(file_diff) - 1
                        
                        for step in range(1, steps + 1):
                            check_file = chess.square_file(landing_square) + step * direction
                            check_square = chess.square(check_file, chess.square_rank(landing_square))
                            
                            if board_after.piece_at(check_square):
                                clear_path = False
                                break
                    else:  # Same file
                        direction = -1 if rank_diff > 0 else 1
                        steps = abs(rank_diff) - 1
                        
                        for step in range(1, steps + 1):
                            check_rank = chess.square_rank(landing_square) + step * direction
                            check_square = chess.square(chess.square_file(landing_square), check_rank)
                            
                            if board_after.piece_at(check_square):
                                clear_path = False
                                break
                                
                    if clear_path:
                        can_attack = True
                        
            # Pawn attacks
            elif piece.piece_type == chess.PAWN:
                rank_diff = chess.square_rank(landing_square) - chess.square_rank(target_square)
                file_diff = chess.square_file(landing_square) - chess.square_file(target_square)
                
                if piece.color == chess.WHITE and rank_diff == 1 and abs(file_diff) == 1:
                    can_attack = True
                elif piece.color == chess.BLACK and rank_diff == -1 and abs(file_diff) == 1:
                    can_attack = True
                    
            # King attacks
            elif piece.piece_type == chess.KING:
                rank_diff = abs(chess.square_rank(landing_square) - chess.square_rank(target_square))
                file_diff = abs(chess.square_file(landing_square) - chess.square_file(target_square))
                
                if rank_diff <= 1 and file_diff <= 1 and not (rank_diff == 0 and file_diff == 0):
                    can_attack = True
            
            # If the piece now attacks the target, check if it was not previously attacked
            if can_attack:
                # Check if the piece didn't attack this target before the move
                was_attacking_before = False
                
                # Check if the piece was attacking this square before the move
                # We're simplifying this by just checking if the target was attacked before
                if board_before.is_attacked_by(piece.color, target_square):
                    # This is a simplification; a more thorough check would be better
                    was_attacking_before = True
                        
                if not was_attacking_before:
                    newly_attacked_pieces.append(square)
        
        # Check if we have at least two new targets
        if len(newly_attacked_pieces) >= 2:
            # Check if the square is safe (not defended or adequately defended)
            landing_square_file = chess.square_file(move.to_square)
            landing_square_rank = chess.square_rank(move.to_square)
            
            if piece.color == chess.WHITE:
                our_control = control_after.white_control[landing_square_rank][landing_square_file]
                our_material = control_after.white_control_material[landing_square_rank][landing_square_file]
                opponent_control = control_after.black_control[landing_square_rank][landing_square_file]
                opponent_material = control_after.black_control_material[landing_square_rank][landing_square_file]
            else:
                our_control = control_after.black_control[landing_square_rank][landing_square_file]
                our_material = control_after.black_control_material[landing_square_rank][landing_square_file]
                opponent_control = control_after.white_control[landing_square_rank][landing_square_file]
                opponent_material = control_after.white_control_material[landing_square_rank][landing_square_file]
            
            # Safety criteria (per analysis-engine.md)
            is_safe = (
                opponent_control == 0 or  # Undefended
                our_control > opponent_control or  # Better defended
                (our_control == opponent_control and our_material >= opponent_material)  # Equal defense with material advantage
            )
            
            if is_safe:
                target_descriptions = []
                for square in newly_attacked_pieces:
                    target_piece = board_after.piece_at(square)
                    piece_name = target_piece.symbol().upper() if target_piece.color == chess.WHITE else target_piece.symbol().lower()
                    target_descriptions.append(f"{piece_name} on {chess.square_name(square)}")
                
                return TacticalMotif(
                    motif_type="fork",
                    piece=piece.symbol(),
                    piece_square=chess.square_name(move.to_square),
                    targets=[chess.square_name(sq) for sq in newly_attacked_pieces],
                    move=move.uci(),
                    description=f"{piece.symbol()} fork from {chess.square_name(move.to_square)} targeting {', '.join(target_descriptions)}"
                )
        
        return None
    
    def detect_pin(self, board_before: chess.Board, board_after: chess.Board, move: chess.Move,
                  control_before: SquareControl, control_after: SquareControl) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a pin.
        
        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move
            
        Returns:
            TacticalMotif if pin is detected, None otherwise
        """
        # Implementation following analysis-engine.md criteria for pins
        piece = board_after.piece_at(move.to_square)
        
        # Only long-range pieces can create pins (bishop, rook, queen)
        if not piece or piece.piece_type not in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
            return None
            
        # Check if the move is not a check
        if board_after.is_check():
            return None
            
        # Get attacked pieces
        pinned_pieces = []
        valuable_pieces_behind = []
        
        # For each direction that this piece can move
        directions = []
        
        # Add appropriate directions based on piece type
        if piece.piece_type in [chess.BISHOP, chess.QUEEN]:
            directions.extend([(1, 1), (1, -1), (-1, 1), (-1, -1)])  # Diagonals
        
        if piece.piece_type in [chess.ROOK, chess.QUEEN]:
            directions.extend([(0, 1), (1, 0), (0, -1), (-1, 0)])  # Orthogonals
            
        # For each direction, scan for possible pins
        for dx, dy in directions:
            file = chess.square_file(move.to_square)
            rank = chess.square_rank(move.to_square)
            
            first_piece = None
            second_piece = None
            
            # Scan in this direction
            steps = 1
            while True:
                new_file, new_rank = file + dx * steps, rank + dy * steps
                
                # Check if we're still on the board
                if not (0 <= new_file < 8 and 0 <= new_rank < 8):
                    break
                    
                new_square = chess.square(new_file, new_rank)
                piece_at_square = board_after.piece_at(new_square)
                
                if piece_at_square:
                    if first_piece is None:
                        # This is the first piece we've found
                        if piece_at_square.color != piece.color:
                            first_piece = new_square
                        else:
                            # Same color as pinner, not a pin
                            break
                    else:
                        # This is the second piece we've found
                        if piece_at_square.color != piece.color:
                            # Not a pin, both pieces same color as attacker
                            break
                        else:
                            # Potential pin
                            second_piece = new_square
                            break
                
                steps += 1
                
            if first_piece is not None and second_piece is not None:
                # We have a potential pin
                pinned_piece = board_after.piece_at(first_piece)
                valuable_piece = board_after.piece_at(second_piece)
                
                # Check if the pinned piece is less valuable than the pinner
                if PIECE_VALUES[pinned_piece.piece_type] <= PIECE_VALUES[piece.piece_type]:
                    pinned_pieces.append(first_piece)
                    valuable_pieces_behind.append(second_piece)
        
        if pinned_pieces:
            # We have at least one pin
            target_descriptions = []
            
            for pinned_square, valuable_square in zip(pinned_pieces, valuable_pieces_behind):
                pinned_piece = board_after.piece_at(pinned_square)
                valuable_piece = board_after.piece_at(valuable_square)
                
                pinned_name = pinned_piece.symbol().upper() if pinned_piece.color == chess.WHITE else pinned_piece.symbol().lower()
                valuable_name = valuable_piece.symbol().upper() if valuable_piece.color == chess.WHITE else valuable_piece.symbol().lower()
                
                target_descriptions.append(
                    f"{pinned_name} on {chess.square_name(pinned_square)} pinned to {valuable_name} on {chess.square_name(valuable_square)}"
                )
            
            return TacticalMotif(
                motif_type="pin",
                piece=piece.symbol(),
                piece_square=chess.square_name(move.to_square),
                targets=[chess.square_name(sq) for sq in pinned_pieces],
                move=move.uci(),
                description=f"{piece.symbol()} creates pin(s) from {chess.square_name(move.to_square)}: {'; '.join(target_descriptions)}"
            )
        
        return None
    
    def detect_skewer(self, board_before: chess.Board, board_after: chess.Board, move: chess.Move,
                     control_before: SquareControl, control_after: SquareControl) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a skewer (similar to pin, but more valuable piece first)
        
        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move
            
        Returns:
            TacticalMotif if skewer is detected, None otherwise
        """
        # Skewer detection follows similar logic to pin detection, but with more valuable piece first
        piece = board_after.piece_at(move.to_square)
        
        # Only long-range pieces can create skewers
        if not piece or piece.piece_type not in [chess.BISHOP, chess.ROOK, chess.QUEEN]:
            return None
            
        # Check if the move is not a check
        if board_after.is_check():
            return None
            
        # Get attacked pieces
        skewered_pieces = []
        less_valuable_pieces_behind = []
        
        # For each direction that this piece can move
        directions = []
        
        # Add appropriate directions based on piece type
        if piece.piece_type in [chess.BISHOP, chess.QUEEN]:
            directions.extend([(1, 1), (1, -1), (-1, 1), (-1, -1)])  # Diagonals
        
        if piece.piece_type in [chess.ROOK, chess.QUEEN]:
            directions.extend([(0, 1), (1, 0), (0, -1), (-1, 0)])  # Orthogonals
            
        # For each direction, scan for possible skewers
        for dx, dy in directions:
            file = chess.square_file(move.to_square)
            rank = chess.square_rank(move.to_square)
            
            first_piece = None
            second_piece = None
            
            # Scan in this direction
            steps = 1
            while True:
                new_file, new_rank = file + dx * steps, rank + dy * steps
                
                # Check if we're still on the board
                if not (0 <= new_file < 8 and 0 <= new_rank < 8):
                    break
                    
                new_square = chess.square(new_file, new_rank)
                piece_at_square = board_after.piece_at(new_square)
                
                if piece_at_square:
                    if first_piece is None:
                        # This is the first piece we've found
                        if piece_at_square.color != piece.color:
                            first_piece = new_square
                        else:
                            # Same color as pinner, not a skewer
                            break
                    else:
                        # This is the second piece we've found
                        if piece_at_square.color != piece.color:
                            # Not a skewer, both pieces same color as attacker
                            break
                        else:
                            # Potential skewer
                            second_piece = new_square
                            break
                
                steps += 1
                
            if first_piece is not None and second_piece is not None:
                # We have a potential skewer
                skewered_piece = board_after.piece_at(first_piece)
                less_valuable_piece = board_after.piece_at(second_piece)
                
                # Check if the skewered piece is more valuable than the attacker (skewer condition)
                if PIECE_VALUES[skewered_piece.piece_type] > PIECE_VALUES[piece.piece_type]:
                    skewered_pieces.append(first_piece)
                    less_valuable_pieces_behind.append(second_piece)
        
        if skewered_pieces:
            # We have at least one skewer
            target_descriptions = []
            
            for skewered_square, less_valuable_square in zip(skewered_pieces, less_valuable_pieces_behind):
                skewered_piece = board_after.piece_at(skewered_square)
                less_valuable_piece = board_after.piece_at(less_valuable_square)
                
                skewered_name = skewered_piece.symbol().upper() if skewered_piece.color == chess.WHITE else skewered_piece.symbol().lower()
                less_valuable_name = less_valuable_piece.symbol().upper() if less_valuable_piece.color == chess.WHITE else less_valuable_piece.symbol().lower()
                
                target_descriptions.append(
                    f"{skewered_name} on {chess.square_name(skewered_square)} skewered with {less_valuable_name} on {chess.square_name(less_valuable_square)}"
                )
            
            return TacticalMotif(
                motif_type="skewer",
                piece=piece.symbol(),
                piece_square=chess.square_name(move.to_square),
                targets=[chess.square_name(sq) for sq in skewered_pieces],
                move=move.uci(),
                description=f"{piece.symbol()} creates skewer(s) from {chess.square_name(move.to_square)}: {'; '.join(target_descriptions)}"
            )
        
        return None
    
    def detect_discovered_check(self, board_before: chess.Board, board_after: chess.Board, move: chess.Move,
                              control_before: SquareControl, control_after: SquareControl) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a discovered check.
        
        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move
            
        Returns:
            TacticalMotif if discovered check is detected, None otherwise
        """
        # Must result in a check to be a discovered check
        if not board_after.is_check():
            return None
            
        # The moving piece must not be directly giving the check
        # Get the piece after it moved
        piece = board_after.piece_at(move.to_square)
        if not piece:
            return None
            
        # Find king position
        king_square = None
        king_color = not piece.color
        for square in chess.SQUARES:
            sq_piece = board_after.piece_at(square)
            if sq_piece and sq_piece.piece_type == chess.KING and sq_piece.color == king_color:
                king_square = square
                break
        
        if king_square is None:
            return None
            
        # Check if the moved piece directly attacks the king
        directly_checks = False
        
        # Make a hypothetical board with just this piece and check
        test_board = chess.Board(fen="8/8/8/8/8/8/8/8 w - - 0 1")
        test_board.set_piece_at(move.to_square, piece)
        test_board.set_piece_at(king_square, chess.Piece(chess.KING, king_color))
        test_board.turn = piece.color
        
        # If the test board is in check, the moved piece directly checks
        if test_board.is_check():
            directly_checks = True
        
        if not directly_checks:
            # We have a discovered check!
            # Find which piece is giving the check
            checker = None
            checker_square = None
            
            # Check line from king to each potential attacking piece
            for square in chess.SQUARES:
                sq_piece = board_after.piece_at(square)
                if sq_piece and sq_piece.color == piece.color and square != move.to_square:
                    # Make a test board with just this piece and the king
                    test_board = chess.Board(fen="8/8/8/8/8/8/8/8 w - - 0 1")
                    test_board.set_piece_at(square, sq_piece)
                    test_board.set_piece_at(king_square, chess.Piece(chess.KING, king_color))
                    test_board.turn = piece.color
                    
                    if test_board.is_check():
                        checker = sq_piece
                        checker_square = square
                        break
            
            if checker:
                # Get the king's position in square name
                king_square_name = chess.square_name(king_square)
                
                # Reconstruct move description without referencing move.from_square
                move_uci = move.uci()
                from_square_name = move_uci[:2]  # First two characters of UCI are the from square
                to_square_name = move_uci[2:4]   # Next two characters are the to square
                
                return TacticalMotif(
                    motif_type="discovered_check",
                    piece=piece.symbol(),
                    piece_square=chess.square_name(move.to_square),
                    targets=[king_square_name],
                    move=move_uci,
                    description=(f"{piece.symbol()} moves from {from_square_name} to "
                                f"{to_square_name}, revealing check from "
                                f"{checker.symbol()} on {chess.square_name(checker_square)}")
                )
        
        return None

    def analyze_move_for_tactics(self, board_before: chess.Board, board_after: chess.Board, 
                               move: chess.Move) -> List[TacticalMotif]:
        """
        Analyze a move for tactical patterns.
        
        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            
        Returns:
            List of detected tactical motifs
        """
        # Calculate square control metrics before and after the move
        control_before = self.calculate_square_control(board_before)
        control_after = self.calculate_square_control(board_after)
        
        # Check for each tactical pattern
        tactics = []
        
        try:
            # Check for fork
            fork = self.detect_fork(board_before, board_after, move, control_before, control_after)
            if fork:
                tactics.append(fork)
            
            # Check for pin
            pin = self.detect_pin(board_before, board_after, move, control_before, control_after)
            if pin:
                tactics.append(pin)
            
            # Check for skewer
            skewer = self.detect_skewer(board_before, board_after, move, control_before, control_after)
            if skewer:
                tactics.append(skewer)
            
            # Check for discovered check
            discovered_check = self.detect_discovered_check(board_before, board_after, move, control_before, control_after)
            if discovered_check:
                tactics.append(discovered_check)
        except Exception as e:
            logger.error(f"Error analyzing tactics: {e}")
        
        return tactics

# Create a singleton instance
tactics_service = TacticsService()