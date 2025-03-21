import logging
from typing import Any, Dict, List, Optional, Tuple

import chess
import chess.pgn

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
    chess.KING: 0,  # Not factored in material calculations
}


class TacticsService:
    """Service for detecting tactical patterns in chess positions."""

    def calculate_square_control(self, board: chess.Board) -> SquareControl:
        """
        Calculate square control metrics for a given board position using python-chess's built-in
        attackers() method for more accurate and efficient calculation.

        Args:
            board: Chess board position

        Returns:
            SquareControl object with metrics for each square
        """
        try:
            # Initialize data structures
            white_control = [[0 for _ in range(8)] for _ in range(8)]
            black_control = [[0 for _ in range(8)] for _ in range(8)]
            white_control_material = [[0 for _ in range(8)] for _ in range(8)]
            black_control_material = [[0 for _ in range(8)] for _ in range(8)]
            white_legal_moves = {}
            black_legal_moves = {}

            # Calculate control for each square on the board
            for square in chess.SQUARES:
                file_idx = chess.square_file(square)
                rank_idx = chess.square_rank(square)

                # Get white attackers for this square using built-in function
                white_attackers = board.attackers(chess.WHITE, square)
                for attacker in white_attackers:
                    piece_type = board.piece_type_at(attacker)
                    white_control[rank_idx][file_idx] += 1
                    white_control_material[rank_idx][file_idx] += PIECE_VALUES.get(
                        piece_type, 0
                    )

                # Get black attackers for this square using built-in function
                black_attackers = board.attackers(chess.BLACK, square)
                for attacker in black_attackers:
                    piece_type = board.piece_type_at(attacker)
                    black_control[rank_idx][file_idx] += 1
                    black_control_material[rank_idx][file_idx] += PIECE_VALUES.get(
                        piece_type, 0
                    )

            # Calculate legal moves for each piece using python-chess's move generation
            for piece_square in chess.SQUARES:
                piece = board.piece_at(piece_square)
                if not piece:
                    continue

                # Get square name (e.g., "e4")
                square_name = chess.square_name(piece_square)

                # Generate all legal moves for this piece
                legal_moves = []
                for move in board.legal_moves:
                    if move.from_square == piece_square:
                        legal_moves.append(chess.square_name(move.to_square))

                # Store legal moves by color
                if piece.color == chess.WHITE:
                    white_legal_moves[square_name] = legal_moves
                else:
                    black_legal_moves[square_name] = legal_moves

            # Create and return the SquareControl object
            square_control = SquareControl(
                white_control=white_control,
                black_control=black_control,
                white_control_material=white_control_material,
                black_control_material=black_control_material,
                white_legal_moves=white_legal_moves,
                black_legal_moves=black_legal_moves,
            )

            return square_control

        except Exception as e:
            logger.error(f"Error calculating square control: {e}")
            # Fallback to empty control metrics
            empty_control = [[0 for _ in range(8)] for _ in range(8)]
            empty_material = [[0 for _ in range(8)] for _ in range(8)]

            return SquareControl(
                white_control=empty_control,
                black_control=empty_control,
                white_control_material=empty_material,
                black_control_material=empty_material,
                white_legal_moves={},
                black_legal_moves={},
            )

    def detect_fork(
        self,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move,
        control_before: SquareControl,
        control_after: SquareControl,
    ) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a fork according to the criteria in analysis-engine.md:

        1. Safety Check: Verify the landing square has opponent control value of 0 (undefended)
        2. Multiple Targets: Confirm at least two newly attacked squares contain pieces with favorable control
        3. Safety Exception: Allow forks where landing square has opponent control > 0 if attacker's control is greater
           or there's equal control with lower material at risk
        4. Value Exception: Allow targets with unfavorable control ratios if material exchange favors attacker

        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move

        Returns:
            TacticalMotif if fork is detected, None otherwise
        """
        try:
            # Get the piece that moved
            piece = board_after.piece_at(move.to_square)
            if not piece:
                return None

            # Get landing square coordinates for control metrics
            landing_sq_file = chess.square_file(move.to_square)
            landing_sq_rank = chess.square_rank(move.to_square)

            # Get the control metrics for the landing square
            if piece.color == chess.WHITE:
                attacker_control = control_after.white_control[landing_sq_rank][
                    landing_sq_file
                ]
                attacker_material = control_after.white_control_material[
                    landing_sq_rank
                ][landing_sq_file]
                defender_control = control_after.black_control[landing_sq_rank][
                    landing_sq_file
                ]
                defender_material = control_after.black_control_material[
                    landing_sq_rank
                ][landing_sq_file]
            else:  # BLACK
                attacker_control = control_after.black_control[landing_sq_rank][
                    landing_sq_file
                ]
                attacker_material = control_after.black_control_material[
                    landing_sq_rank
                ][landing_sq_file]
                defender_control = control_after.white_control[landing_sq_rank][
                    landing_sq_file
                ]
                defender_material = control_after.white_control_material[
                    landing_sq_rank
                ][landing_sq_file]

            # 1. Safety Check: Verify the landing square has opponent control value of 0 (undefended)
            safe_landing = False

            if defender_control == 0:
                # Criterion 1: Landing square is undefended
                safe_landing = True
                logger.debug(
                    f"Fork safety check: Landing square {chess.square_name(move.to_square)} is undefended"
                )
            else:
                # 3. Safety Exception: Check if the landing square is still safe despite being defended
                if attacker_control > defender_control:
                    # Attacker's control is greater than defender's
                    safe_landing = True
                    logger.debug(
                        f"Fork safety exception: Attacker control ({attacker_control}) > defender control ({defender_control})"
                    )
                elif (
                    attacker_control == defender_control
                    and attacker_material >= defender_material
                ):
                    # Equal control with equal or greater material value
                    safe_landing = True
                    logger.debug(
                        f"Fork safety exception: Equal control with favorable material exchange"
                    )

            # If the landing square is not safe by any criteria, no fork
            if not safe_landing:
                return None

            # Find all newly attacked pieces
            newly_attacked_pieces = []
            valid_targets = []

            opponent_color = not piece.color

            # Use built-in python-chess functionality to find attacked squares
            for target_square in chess.SQUARES:
                target_piece = board_after.piece_at(target_square)

                # Skip if no piece or not an opponent piece
                if not target_piece or target_piece.color == piece.color:
                    continue

                # Check if this opponent piece is newly attacked by our moved piece
                if board_after.is_attacked_by(piece.color, target_square):
                    # Check if the piece on move.to_square attacks the target piece
                    # The most reliable way is to use is_attacked_by with specific square
                    piece_attacks_target = False

                    # Since we already confirmed the target is attacked by piece color,
                    # we need to verify this specific piece at move.to_square is an attacker
                    attackers_to_target = board_after.attackers(
                        piece.color, target_square
                    )
                    if move.to_square in attackers_to_target:
                        # Confirm this is a new attack that wasn't there before
                        was_attacking_before = False

                        # Check if the piece was previously attacking from its old position
                        if board_before.piece_at(move.from_square):
                            prev_attackers = board_before.attackers(
                                piece.color, target_square
                            )
                            was_attacking_before = move.from_square in prev_attackers

                        if not was_attacking_before:
                            piece_attacks_target = True

                    if piece_attacks_target:
                        # If we get here, we've already verified was_attacking_before is false
                        newly_attacked_pieces.append(target_square)

                        # Get target square coordinates
                        target_file = chess.square_file(target_square)
                        target_rank = chess.square_rank(target_square)

                        # 2. Multiple Targets: Get control metrics for target square
                        if piece.color == chess.WHITE:
                            target_attacker_control = control_after.white_control[
                                target_rank
                            ][target_file]
                            target_defender_control = control_after.black_control[
                                target_rank
                            ][target_file]
                        else:  # BLACK
                            target_attacker_control = control_after.black_control[
                                target_rank
                            ][target_file]
                            target_defender_control = control_after.white_control[
                                target_rank
                            ][target_file]

                        # Check for favorable control ratio or value exception
                        favorable_target = False

                        if target_attacker_control > target_defender_control:
                            # Favorable control ratio
                            favorable_target = True
                            logger.debug(
                                f"Favorable control ratio: {target_attacker_control} > {target_defender_control}"
                            )
                        else:
                            # 4. Value Exception: Check if material exchange would favor the attacker
                            # Compare material values of the pieces
                            attacker_piece_value = PIECE_VALUES[piece.piece_type]
                            target_piece_value = PIECE_VALUES[target_piece.piece_type]

                            if target_piece_value > attacker_piece_value:
                                # Target is more valuable than attacker (e.g., knight attacking queen)
                                favorable_target = True
                                logger.debug(
                                    f"Value exception: {chess.square_name(move.to_square)} ({attacker_piece_value}) attacking {chess.square_name(target_square)} ({target_piece_value})"
                                )

                        if favorable_target:
                            valid_targets.append(target_square)

            # Check if we have at least two valid targets for a fork
            if len(valid_targets) >= 2:
                # We have a fork - create detailed description
                target_descriptions = []
                for target_square in valid_targets:
                    target_piece = board_after.piece_at(target_square)
                    piece_symbol = (
                        target_piece.symbol().upper()
                        if target_piece.color == chess.WHITE
                        else target_piece.symbol().lower()
                    )
                    target_descriptions.append(
                        f"{piece_symbol} on {chess.square_name(target_square)}"
                    )

                piece_symbol = (
                    piece.symbol().upper()
                    if piece.color == chess.WHITE
                    else piece.symbol().lower()
                )

                return TacticalMotif(
                    motif_type="fork",
                    piece=piece_symbol,
                    piece_square=chess.square_name(move.to_square),
                    targets=[chess.square_name(sq) for sq in valid_targets],
                    move=move.uci(),
                    description=f"{piece_symbol} fork from {chess.square_name(move.to_square)} targeting {', '.join(target_descriptions)}",
                )

            return None

        except Exception as e:
            logger.error(f"Error in detect_fork: {e}")
            return None

    def detect_pin(
        self,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move,
        control_before: SquareControl,
        control_after: SquareControl,
    ) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a pin according to the criteria in analysis-engine docs:

        1. Not Check: The move should not result in a check
        2. Long-Range Piece: Verify the moved piece is a bishop, rook, or queen
        3. Legal Moves Comparison: Check if newly attacked piece has fewer legal moves than before
        4. Pin Identification: The newly attacked piece cannot take the moved piece
        5. Material Value Analysis: Pinned piece material value <= moved piece value

        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move

        Returns:
            TacticalMotif if pin is detected, None otherwise
        """
        try:
            # 1. Check if the move results in a check - if yes, not a pin
            if board_after.is_check():
                logger.debug(
                    f"Pin detection: Move {move.uci()} results in check, not a pin"
                )
                return None

            # 2. Long-Range Piece: Only bishops, rooks, and queens can create pins
            piece = board_after.piece_at(move.to_square)
            if not piece or piece.piece_type not in [
                chess.BISHOP,
                chess.ROOK,
                chess.QUEEN,
            ]:
                return None

            # We'll track pinned pieces and the valuable pieces behind them
            pinned_pieces = []
            valuable_pieces_behind = []
            piece_legal_moves_before = (
                {}
            )  # Store legal moves count before for comparison

            # Get opponent color
            opponent_color = not piece.color

            # Identify which directions to check based on piece type
            directions = []
            if piece.piece_type in [chess.BISHOP, chess.QUEEN]:
                directions.extend([(1, 1), (1, -1), (-1, 1), (-1, -1)])  # Diagonals
            if piece.piece_type in [chess.ROOK, chess.QUEEN]:
                directions.extend([(0, 1), (1, 0), (0, -1), (-1, 0)])  # Orthogonals

            # For each direction, scan for possible pins
            for dx, dy in directions:
                file = chess.square_file(move.to_square)
                rank = chess.square_rank(move.to_square)

                # Track pieces found in this direction
                first_piece = None
                second_piece = None

                # Scan in the given direction
                steps = 1
                while True:
                    new_file, new_rank = file + dx * steps, rank + dy * steps

                    # Check if we're still on the board
                    if not (0 <= new_file < 8 and 0 <= new_rank < 8):
                        break

                    new_square = chess.square(new_file, new_rank)
                    piece_at_square = board_after.piece_at(new_square)

                    # Found a piece in this direction
                    if piece_at_square:
                        if first_piece is None:
                            # This is the first piece we've found
                            if piece_at_square.color == opponent_color:
                                first_piece = new_square

                                # Store how many legal moves this piece has before the move
                                board_copy_before = chess.Board(board_before.fen())
                                # Get all legal moves for the first piece before the move
                                legal_moves_before = []
                                for move_before in board_before.legal_moves:
                                    if move_before.from_square == new_square:
                                        legal_moves_before.append(move_before)
                                piece_legal_moves_before[new_square] = len(
                                    legal_moves_before
                                )
                            else:
                                # Same color as pinner, not a pin
                                break
                        else:
                            # This is the second piece we've found
                            if piece_at_square.color == opponent_color:
                                # Second opponent piece - potential valuable piece
                                second_piece = new_square
                                break
                            else:
                                # Piece of same color blocks the pin
                                break

                    # Continue scanning this direction
                    steps += 1

                # If we found a potential pin (opponent piece + another opponent piece behind it)
                if first_piece is not None and second_piece is not None:
                    pinned_piece = board_after.piece_at(first_piece)
                    valuable_piece = board_after.piece_at(second_piece)

                    # 3. Legal Moves Comparison: Check if pinned piece has fewer legal moves
                    legal_moves_after = []
                    for move_after in board_after.legal_moves:
                        if move_after.from_square == first_piece:
                            legal_moves_after.append(move_after)

                    # Calculate how many legal moves were lost
                    moves_before = piece_legal_moves_before.get(first_piece, 0)
                    moves_after = len(legal_moves_after)

                    # 4. Pin Identification: Check if pinned piece CAN'T take the moved piece
                    can_take_pinner = False
                    for legal_move in legal_moves_after:
                        if legal_move.to_square == move.to_square:
                            can_take_pinner = True
                            break

                    # 5. Material Value Analysis for classification
                    pinned_value = PIECE_VALUES[pinned_piece.piece_type]
                    pinner_value = PIECE_VALUES[piece.piece_type]
                    valuable_value = PIECE_VALUES[valuable_piece.piece_type]

                    # For a pin:
                    # - Pinned piece must have fewer legal moves than before
                    # - Pinned piece cannot take the pinner
                    # - Valuable piece must be more valuable than pinned piece
                    # - Pinned piece value <= pinner piece value

                    is_pin = (
                        moves_after < moves_before  # Fewer legal moves
                        and not can_take_pinner  # Cannot take pinner
                        and valuable_value
                        > pinned_value  # Valuable piece is more valuable
                        and pinned_value
                        <= pinner_value  # Classic pin material relationship
                    )

                    if is_pin:
                        pinned_pieces.append(first_piece)
                        valuable_pieces_behind.append(second_piece)
                        logger.debug(
                            f"Pin detected: {chess.square_name(first_piece)} to {chess.square_name(second_piece)}"
                        )

            # Create tactical motif for all detected pins
            if pinned_pieces:
                target_descriptions = []

                for pinned_square, valuable_square in zip(
                    pinned_pieces, valuable_pieces_behind
                ):
                    pinned_piece = board_after.piece_at(pinned_square)
                    valuable_piece = board_after.piece_at(valuable_square)

                    pinned_symbol = (
                        pinned_piece.symbol().upper()
                        if pinned_piece.color == chess.WHITE
                        else pinned_piece.symbol().lower()
                    )
                    valuable_symbol = (
                        valuable_piece.symbol().upper()
                        if valuable_piece.color == chess.WHITE
                        else valuable_piece.symbol().lower()
                    )

                    target_descriptions.append(
                        f"{pinned_symbol} on {chess.square_name(pinned_square)} pinned to {valuable_symbol} on {chess.square_name(valuable_square)}"
                    )

                piece_symbol = (
                    piece.symbol().upper()
                    if piece.color == chess.WHITE
                    else piece.symbol().lower()
                )

                return TacticalMotif(
                    motif_type="pin",
                    piece=piece_symbol,
                    piece_square=chess.square_name(move.to_square),
                    targets=[chess.square_name(sq) for sq in pinned_pieces],
                    move=move.uci(),
                    description=f"{piece_symbol} creates pin(s) from {chess.square_name(move.to_square)}: {'; '.join(target_descriptions)}",
                )

            return None

        except Exception as e:
            logger.error(f"Error in detect_pin: {e}")
            return None

    def detect_skewer(
        self,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move,
        control_before: SquareControl,
        control_after: SquareControl,
    ) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a skewer according to the criteria in analysis-engine docs:

        1. Not Check: The move should not result in a check
        2. Long-Range Piece: Verify the moved piece is a bishop, rook, or queen
        3. Legal Moves Comparison: Check if newly attacked piece has fewer legal moves
        4. Skewer Identification: The piece CAN take the moved piece but cannot move elsewhere
        5. Material Value Analysis: First piece material value > moved piece value

        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move

        Returns:
            TacticalMotif if skewer is detected, None otherwise
        """
        try:
            # 1. Check if the move results in a check - if yes, not a skewer
            if board_after.is_check():
                logger.debug(
                    f"Skewer detection: Move {move.uci()} results in check, not a skewer"
                )
                return None

            # 2. Long-Range Piece: Only bishops, rooks, and queens can create skewers
            piece = board_after.piece_at(move.to_square)
            if not piece or piece.piece_type not in [
                chess.BISHOP,
                chess.ROOK,
                chess.QUEEN,
            ]:
                return None

            # Track pieces that might be skewered and pieces behind them
            skewered_pieces = []
            pieces_behind = []
            piece_legal_moves_before = (
                {}
            )  # Store legal moves count before for comparison

            # Opponent's color
            opponent_color = not piece.color

            # Identify which directions to check based on piece type
            directions = []
            if piece.piece_type in [chess.BISHOP, chess.QUEEN]:
                directions.extend([(1, 1), (1, -1), (-1, 1), (-1, -1)])  # Diagonals
            if piece.piece_type in [chess.ROOK, chess.QUEEN]:
                directions.extend([(0, 1), (1, 0), (0, -1), (-1, 0)])  # Orthogonals

            # For each direction, scan for possible skewers
            for dx, dy in directions:
                file = chess.square_file(move.to_square)
                rank = chess.square_rank(move.to_square)

                # Track pieces found in this direction
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

                    # Found a piece in this direction
                    if piece_at_square:
                        if first_piece is None:
                            # First piece found
                            if piece_at_square.color == opponent_color:
                                first_piece = new_square

                                # Store how many legal moves this piece had before the move
                                legal_moves_before = []
                                for move_before in board_before.legal_moves:
                                    if move_before.from_square == new_square:
                                        legal_moves_before.append(move_before)
                                piece_legal_moves_before[new_square] = len(
                                    legal_moves_before
                                )
                            else:
                                # Same color as attacker, not a skewer
                                break
                        else:
                            # Second piece found
                            if piece_at_square.color == opponent_color:
                                # Second opponent piece
                                second_piece = new_square
                                break
                            else:
                                # Blocked by friendly piece, not a skewer
                                break

                    steps += 1

                # If we found a potential skewer (opponent piece + another opponent piece behind it)
                if first_piece is not None and second_piece is not None:
                    skewered_piece = board_after.piece_at(first_piece)
                    behind_piece = board_after.piece_at(second_piece)

                    # 3. Legal Moves Comparison: Check if skewered piece has fewer legal moves
                    legal_moves_after = []
                    moves_to_uncontrolled_squares = []

                    # Collect legal moves after and check if they go to squares not controlled by attacker
                    for move_after in board_after.legal_moves:
                        if move_after.from_square == first_piece:
                            legal_moves_after.append(move_after)

                            # Check if destination square is controlled by attacker
                            target_file = chess.square_file(move_after.to_square)
                            target_rank = chess.square_rank(move_after.to_square)

                            if piece.color == chess.WHITE:
                                attacker_control = control_after.white_control[
                                    target_rank
                                ][target_file]
                            else:
                                attacker_control = control_after.black_control[
                                    target_rank
                                ][target_file]

                            if (
                                attacker_control == 0
                            ):  # Square not controlled by attacker
                                moves_to_uncontrolled_squares.append(move_after)

                    # 4. Skewer Identification: See if piece can take attacker but has no other good moves
                    can_take_attacker = False
                    for legal_move in legal_moves_after:
                        if legal_move.to_square == move.to_square:
                            can_take_attacker = True
                            break

                    moves_before = piece_legal_moves_before.get(first_piece, 0)
                    moves_after = len(legal_moves_after)
                    moves_to_safety = len(moves_to_uncontrolled_squares)

                    # 5. Material Value Analysis: For skewer, first piece > attacker piece
                    skewered_value = PIECE_VALUES[skewered_piece.piece_type]
                    attacker_value = PIECE_VALUES[piece.piece_type]
                    behind_value = PIECE_VALUES[behind_piece.piece_type]

                    # For a skewer:
                    # - First piece must have fewer legal moves than before
                    # - The skewered piece CAN take the attacker
                    # - The skewered piece has no good moves to squares not controlled by attacker
                    # - Skewered piece is more valuable than the attacker

                    is_skewer = (
                        moves_after < moves_before  # Fewer legal moves
                        and can_take_attacker  # Can take the attacker
                        and (
                            moves_to_safety == 0 or moves_to_safety < moves_before
                        )  # Few or no safe moves
                        and skewered_value
                        > attacker_value  # Skewered piece is more valuable
                        and behind_value
                        < skewered_value  # Piece behind is less valuable
                    )

                    if is_skewer:
                        skewered_pieces.append(first_piece)
                        pieces_behind.append(second_piece)
                        logger.debug(
                            f"Skewer detected: {chess.square_name(first_piece)} to {chess.square_name(second_piece)}"
                        )

            # Create tactical motif for all detected skewers
            if skewered_pieces:
                target_descriptions = []

                for skewered_square, behind_square in zip(
                    skewered_pieces, pieces_behind
                ):
                    skewered_piece = board_after.piece_at(skewered_square)
                    behind_piece = board_after.piece_at(behind_square)

                    skewered_symbol = (
                        skewered_piece.symbol().upper()
                        if skewered_piece.color == chess.WHITE
                        else skewered_piece.symbol().lower()
                    )
                    behind_symbol = (
                        behind_piece.symbol().upper()
                        if behind_piece.color == chess.WHITE
                        else behind_piece.symbol().lower()
                    )

                    target_descriptions.append(
                        f"{skewered_symbol} on {chess.square_name(skewered_square)} skewered with {behind_symbol} on {chess.square_name(behind_square)}"
                    )

                piece_symbol = (
                    piece.symbol().upper()
                    if piece.color == chess.WHITE
                    else piece.symbol().lower()
                )

                return TacticalMotif(
                    motif_type="skewer",
                    piece=piece_symbol,
                    piece_square=chess.square_name(move.to_square),
                    targets=[chess.square_name(sq) for sq in skewered_pieces],
                    move=move.uci(),
                    description=f"{piece_symbol} creates skewer(s) from {chess.square_name(move.to_square)}: {'; '.join(target_descriptions)}",
                )

            return None

        except Exception as e:
            logger.error(f"Error in detect_skewer: {e}")
            return None

    def detect_discovered_check(
        self,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move,
        control_before: SquareControl,
        control_after: SquareControl,
    ) -> Optional[TacticalMotif]:
        """
        Detect if a move creates a discovered check according to the criteria in analysis-engine docs:

        1. Check Status: The move must result in a check
        2. Control Change Detection:
           - If opponent king square is controlled by moved piece, control should be +2
           - If opponent king square is not controlled by moved piece, control should be +1

        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            control_before: Square control metrics before move
            control_after: Square control metrics after move

        Returns:
            TacticalMotif if discovered check is detected, None otherwise
        """
        try:
            # 1. Check Status: The move must result in a check
            if not board_after.is_check():
                logger.debug(
                    f"Discovered check detection: Move {move.uci()} does not result in check"
                )
                return None

            # Get the piece that moved
            piece = board_after.piece_at(move.to_square)
            if not piece:
                return None

            # Find opponent king position
            king_square = None
            king_color = not piece.color

            for square in chess.SQUARES:
                sq_piece = board_after.piece_at(square)
                if (
                    sq_piece
                    and sq_piece.piece_type == chess.KING
                    and sq_piece.color == king_color
                ):
                    king_square = square
                    break

            if king_square is None:
                logger.warning(
                    "Discovered check detection: Could not find opponent king"
                )
                return None

            # Get king square coordinates for control metrics
            king_file = chess.square_file(king_square)
            king_rank = chess.square_rank(king_square)

            # Determine if the moved piece directly attacks the king
            # Check if the moved piece directly attacks the king
            attackers_to_king = board_after.attackers(piece.color, king_square)
            directly_attacks_king = move.to_square in attackers_to_king

            # Get control values before and after the move
            if piece.color == chess.WHITE:
                control_before_val = control_before.white_control[king_rank][king_file]
                control_after_val = control_after.white_control[king_rank][king_file]
            else:
                control_before_val = control_before.black_control[king_rank][king_file]
                control_after_val = control_after.black_control[king_rank][king_file]

            # 2. Control Change Detection
            control_change = control_after_val - control_before_val
            logger.debug(
                f"Control change on king square: {control_change} (before: {control_before_val}, after: {control_after_val})"
            )

            discovered_check = False

            if directly_attacks_king:
                # If the moved piece controls the king, control should increase by at least 2
                # (1 for the moved piece + at least 1 for the discovered piece)
                if control_change >= 2:
                    discovered_check = True
            else:
                # If the moved piece doesn't control the king, control should increase by at least 1
                # (from the discovered piece)
                if control_change >= 1:
                    discovered_check = True

            if discovered_check:
                # Find which piece is giving the check (not the moved piece)
                checker_piece = None
                checker_square = None

                # Identify the checking piece by testing all pieces of the same color
                for square in chess.SQUARES:
                    sq_piece = board_after.piece_at(square)
                    if (
                        sq_piece
                        and sq_piece.color == piece.color
                        and square != move.to_square
                    ):
                        # Check if this piece attacks the king
                        attackers_to_king = board_after.attackers(
                            piece.color, king_square
                        )
                        if square in attackers_to_king:
                            # This piece is giving the check
                            checker_piece = sq_piece
                            checker_square = square
                            break

                if checker_piece:
                    # Get descriptive info for the tactical motif
                    king_square_name = chess.square_name(king_square)
                    move_uci = move.uci()
                    from_square_name = chess.square_name(move.from_square)
                    to_square_name = chess.square_name(move.to_square)

                    piece_symbol = (
                        piece.symbol().upper()
                        if piece.color == chess.WHITE
                        else piece.symbol().lower()
                    )
                    checker_symbol = (
                        checker_piece.symbol().upper()
                        if checker_piece.color == chess.WHITE
                        else checker_piece.symbol().lower()
                    )

                    return TacticalMotif(
                        motif_type="discovered_check",
                        piece=piece_symbol,
                        piece_square=to_square_name,
                        targets=[king_square_name],
                        move=move_uci,
                        description=(
                            f"{piece_symbol} moves from {from_square_name} to "
                            f"{to_square_name}, revealing check from "
                            f"{checker_symbol} on {chess.square_name(checker_square)}"
                        ),
                    )

            return None

        except Exception as e:
            logger.error(f"Error in detect_discovered_check: {e}")
            return None

    def analyze_move_for_tactics(
        self,
        board_before: chess.Board,
        board_after: chess.Board,
        move: chess.Move,
        is_best_move: bool = True,
    ) -> List[TacticalMotif]:
        """
        Analyze a move for tactical patterns. According to best practices, we only
        identify tactical patterns on Stockfish's best moves, as suboptimal tactical
        opportunities aren't prioritized for teaching purposes.

        Args:
            board_before: Board position before move
            board_after: Board position after move
            move: The move that was played
            is_best_move: Whether this move is Stockfish's recommended best move (default: True)

        Returns:
            List of detected tactical motifs
        """
        # If this isn't the best move, we don't analyze it for tactics
        # This follows our updated specification that focuses exclusively on optimal moves
        if not is_best_move:
            logger.debug(f"Skipping tactical analysis for non-best move: {move.uci()}")
            return []

        try:
            # Calculate square control metrics before and after the move
            control_before = self.calculate_square_control(board_before)
            control_after = self.calculate_square_control(board_after)

            # Check for each tactical pattern
            tactics = []

            # Check for fork
            fork = self.detect_fork(
                board_before, board_after, move, control_before, control_after
            )
            if fork:
                logger.info(f"Fork detected in move {move.uci()}")
                tactics.append(fork)

            # Check for pin
            pin = self.detect_pin(
                board_before, board_after, move, control_before, control_after
            )
            if pin:
                logger.info(f"Pin detected in move {move.uci()}")
                tactics.append(pin)

            # Check for skewer
            skewer = self.detect_skewer(
                board_before, board_after, move, control_before, control_after
            )
            if skewer:
                logger.info(f"Skewer detected in move {move.uci()}")
                tactics.append(skewer)

            # Check for discovered check
            discovered_check = self.detect_discovered_check(
                board_before, board_after, move, control_before, control_after
            )
            if discovered_check:
                logger.info(f"Discovered check detected in move {move.uci()}")
                tactics.append(discovered_check)

            return tactics

        except Exception as e:
            logger.error(f"Error analyzing tactics for move {move.uci()}: {e}")
            return []


# Create a singleton instance
tactics_service = TacticsService()
