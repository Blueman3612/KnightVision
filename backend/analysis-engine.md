###### Standard Evaluation Depth
For consistency in analysis and engine responses, a standardized search depth of 12 is used across all position evaluations in the application. This depth:

- Provides sufficient tactical awareness for accurate evaluations
- Balances computational cost with evaluation accuracy
- Ensures consistent analysis quality across all app features
- Maintains reasonable response times on the server

#### 4.1.2 Game Analysis Engine
- PGN parsing and validation
- Move accuracy evaluation using Stockfish
- Pattern recognition for identifying:
  - Tactical weaknesses (missed forks, pins, etc.)
  - Positional weaknesses (pawn structure, piece activity)
  - Opening knowledge gaps
  - Endgame technique issues
- Statistical aggregation for identifying persistent weaknesses

#### 4.1.3 Lesson and Position Generation
- Mapping identified weaknesses to learning resources
- Algorithm for generating custom positions based on weakness categories
- Difficulty scaling system for adaptive learning

#### 4.1.4 Game Annotation System
- **Square Control Metrics**: A comprehensive system for analyzing piece influence across the board
- Metrics tracked for each square (8×8 grid) include:
  - `white_control`: Number of white pieces attacking, defending, or controlling each square
  - `black_control`: Number of black pieces attacking, defending, or controlling each square
  - `white_control_material`: Total material value of white pieces controlling each square
  - `black_control_material`: Total material value of black pieces controlling each square
- **Legal Moves Tracking**:
  - `white_legal_moves`: Dictionary tracking available legal moves for each white piece
  - `black_legal_moves`: Dictionary tracking available legal moves for each black piece

##### Data Structure Implementation
```
// 8×8 arrays (0-indexed from a1 to h8)
white_control = [
    [0, 0, 0, 0, 0, 0, 0, 0],  // a1-h1
    [0, 0, 0, 0, 0, 0, 0, 0],  // a2-h2
    // ...remaining rows
]

white_control_material = [
    [0, 0, 0, 0, 0, 0, 0, 0],  // a1-h1
    [0, 0, 0, 0, 0, 0, 0, 0],  // a2-h2
    // ...remaining rows
]

// Similar arrays for black_control and black_control_material

// Legal moves tracking
white_legal_moves = {
    "e1": ["e2", "f2", "f1"],  // King at e1 can move to e2, f2, f1
    "d1": ["d2", "d3", "a4"],  // Queen at d1 can move to d2, d3, a4
    // ...entries for all pieces
}
```

##### Material Values
Standard piece values used for material calculations:
- Pawn: 1
- Knight: 3
- Bishop: 3
- Rook: 5
- Queen: 9
- King: 0 (not factored into material calculations, but tracked for control)

##### Example Analysis
Consider a position where square e5 is controlled by:
- White pieces: Knight on c4, Bishop on g3, Pawn on d4
- Black pieces: Rook on e8, Pawn on f6

The control metrics for e5 would be:
- `white_control[4][4] = 3` (three white pieces)
- `white_control_material[4][4] = 7` (Knight 3 + Bishop 3 + Pawn 1)
- `black_control[4][4] = 2` (two black pieces)
- `black_control_material[4][4] = 6` (Rook 5 + Pawn 1)

This data provides valuable insights:
- White has numerical control advantage (+1 piece)
- White has material control advantage (+1 point)
- The square is contested but weighted toward white control

##### Analytical Applications
- **Space Control Analysis**: Identifying areas of the board dominated by each player
- **Piece Activity Evaluation**: Measuring how effectively pieces project influence
- **Attack Preparation Detection**: Recognizing build-up of control in specific regions
- **Weakness Identification**: Finding squares with imbalanced control ratios
- **Strategic Planning Guidance**: Suggesting areas to contest or strengthen control

##### Integration with Game Analysis
This annotation system will be integrated with the Game Analysis Engine to:
- Provide visual heat maps of board control
- Identify critical turning points where control shifted
- Detect patterns in a player's control tendencies
- Generate targeted exercises to improve positional understanding

##### Tactics Annotation Strategy
The Game Analysis Engine uses square control metrics to identify tactical motifs automatically. For tactics annotation, we focus exclusively on Stockfish's best moves, as tactical opportunities that aren't optimal are not prioritized for teaching purposes.

Keep in mind that many suboptimal edge cases to our tactic detection requirements will be ruled out by the necessity of an optimal evaluation.

###### Fork Detection
A fork occurs when a single piece simultaneously attacks two or more enemy pieces. Our detection algorithm applies the following criteria:

1. **Safety Check**: Verify the square the moved piece landed on has an opponent control value of 0 (undefended), ensuring the forking piece isn't immediately capturable.
2. **Multiple Targets**: Confirm at least two newly attacked squares contain pieces with favorable control ratios (i.e., attacker's control > defender's control).
3. **Safety Exception**: Allow forks where the landing square has opponent control > 0 if:
   - Attacker's control is greater than defender's control on that square, OR
   - Equal control but with lower material value at risk (e.g., pawn forks knight/bishop while defended by another pawn)
4. **Value Exception**: Allow targets with unfavorable control ratios if the material exchange would favor the attacker (e.g., knight attacking a queen or rook, pawn attacking a bishop)

**Example: Basic Knight Fork**
```
Position snippet:
Black king on g8, black queen on c8
White knight moves from d5 to e7

Analysis:
- Square e7 (landing square) has black_control[6][4] = 0 (criterion 1 satisfied)
- Knight now attacks king at g8 and queen at c8
- Both attacked pieces have white_control > black_control after the move
- Identified as a fork
```

###### Pins and Skewers Detection
Pins and skewers are tactical motifs where a piece is restricted in movement due to a threat along a line. Our detection algorithm follows these precise criteria:

1. **Not Check**: The move should not result in a check.
2. **Long-Range Piece**: Verify the moved piece is a bishop, rook, or queen.
3. **Legal Moves Comparison**: Check if each NEWLY attacked piece has fewer legal moves than before the move.
   - **Pin Identification**: If the newly attacked piece CANNOT TAKE the moved piece, this is classified as a PIN.
   - **Skewer Identification**: If the newly attacked piece CAN TAKE the moved piece AND no longer has legal moves to squares NOT CONTROLLED by the moved piece, this is classified as a SKEWER.
4. **Material Value Analysis**: If any legal move of a NEWLY attacked piece (piece A) would result in another piece (piece B) that wasn't previously attacked by the moved piece and is of GREATER MATERIAL VALUE being attacked by the moved piece, this implies either a pin or a skewer.
   - **Material-Based Classification**: If piece A's material value is less than or equal to the moved piece, this is a PIN. If piece A's value is greater than the moved piece, this is a SKEWER.

###### Discovered Check Detection
A discovered check occurs when a piece moves away from a line, revealing an attack on the opponent's king. Our algorithm applies these specific rules:

1. **Check Status**: The move must result in a check.
2. **Control Change Detection**:
   - If the opponent king square is controlled by the moved piece, control of this square should have increased by at least 2.
   - If the opponent king square is not controlled by the moved piece, control should have increased by at least 1.

The tactical annotation system will highlight these detected tactical motifs in the game analysis, providing players with concrete examples of opportunities they either capitalized on or missed during play.