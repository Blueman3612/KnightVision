# Knight Vision Analysis Engine Implementation Plan

## 1. Core Issues Identified

1. **Standardized Evaluation Depth**: Currently using 12, but documentation suggests depth 20 is preferred
2. **Tactical Detection Improvements**: Need to focus exclusively on Stockfish's best moves
3. **NAG Annotation Standards**: Missing proper implementation of python-chess NAG constants
4. **API Route Inconsistencies**: Need to standardize routes and fix database operations
5. **Square Control System Implementation**: Current implementation doesn't fully utilize python-chess's built-in functionality

## 2. Implementation Plan

### Phase 1: Core Engine Improvements

1. **Modify StockfishService**:
   - Update default depth to 20 across all analysis functions
   - Improve error handling and logging
   - Optimize engine communication for better performance
   - Standardize evaluation score representation

```python
# Updates to app/services/stockfish.py
class StockfishService:
    def __init__(self):
        """Initialize the Stockfish service."""
        self.engine_path = settings.STOCKFISH_PATH
        self.depth = 20  # Standardized to depth 20
        self.threads = settings.STOCKFISH_THREADS
        # rest of init
```

2. **Enhance TacticsService**:
   - Refactor tactics detection algorithms to follow specification exactly
   - Simplify square control calculation using python-chess's built-in functions
   - Ensure tactical motifs only check Stockfish's best move

```python
# Updates to app/services/tactics.py
def calculate_square_control(self, board: chess.Board) -> SquareControl:
    """Calculate square control using python-chess's attackers() method"""
    white_control = [[0 for _ in range(8)] for _ in range(8)]
    black_control = [[0 for _ in range(8)] for _ in range(8)]
    white_control_material = [[0 for _ in range(8)] for _ in range(8)]
    black_control_material = [[0 for _ in range(8)] for _ in range(8)]
    
    for square in chess.SQUARES:
        file_idx = chess.square_file(square)
        rank_idx = chess.square_rank(square)
        
        # Use attackers() to get all pieces attacking this square
        white_attackers = board.attackers(chess.WHITE, square)
        black_attackers = board.attackers(chess.BLACK, square)
        
        for attacker in white_attackers:
            white_control[rank_idx][file_idx] += 1
            piece_type = board.piece_type_at(attacker)
            white_control_material[rank_idx][file_idx] += PIECE_VALUES.get(piece_type, 0)
        
        for attacker in black_attackers:
            black_control[rank_idx][file_idx] += 1
            piece_type = board.piece_type_at(attacker)
            black_control_material[rank_idx][file_idx] += PIECE_VALUES.get(piece_type, 0)
    
    # Generate legal moves for white and black pieces
    # [...implementation for legal moves tracking...]
    
    return SquareControl(...)
```

3. **Update AnalysisService**:
   - Implement proper NAG constants from python-chess
   - Ensure evaluation changes are calculated consistently
   - Fix annotation of move quality to follow standard chess notation

```python
# Add to app/services/analysis.py
from chess.pgn import NAG_GOOD_MOVE, NAG_MISTAKE, NAG_BRILLIANT_MOVE, NAG_BLUNDER, NAG_SPECULATIVE_MOVE, NAG_DUBIOUS_MOVE

def get_nag_for_classification(classification: str) -> int:
    """Convert classification to standard NAG constant"""
    nag_mapping = {
        "blunder": NAG_BLUNDER,
        "mistake": NAG_MISTAKE,
        "inaccuracy": NAG_DUBIOUS_MOVE,
        "good": NAG_GOOD_MOVE,
        "great": NAG_GOOD_MOVE,
        "excellent": NAG_BRILLIANT_MOVE
    }
    return nag_mapping.get(classification)
```

### Phase 2: Database and API Improvements

1. **Consolidate API Routes**:
   - Remove the non-functional `/analysis/game` endpoint
   - Ensure all endpoints use consistent parameter names and logic
   - Fix database operations for storing analysis results

2. **Update the Enhanced Analysis Endpoint**:
   - Fix database transaction flow to handle failures gracefully
   - Improve error handling and client feedback
   - Ensure proper cleanup of previous analysis data

### Phase 3: Tactical Detection Overhaul

1. **Rebuild Tactical Analysis Functions**:
   - Focus exclusively on Stockfish's best moves
   - Implement the detection criteria exactly as specified in analysis-engine.md
   - Fix fork, pin, skewer and discovered check detection algorithms

```python
# Improved fork detection
def detect_fork(self, board_before: chess.Board, board_after: chess.Board, move: chess.Move) -> Optional[TacticalMotif]:
    """Detect if a move creates a fork following the specification in analysis-engine.md"""
    # Get the piece that moved
    piece = board_after.piece_at(move.to_square)
    if not piece:
        return None
    
    # Safety Check: Verify the landing square is undefended
    landing_square_file = chess.square_file(move.to_square)
    landing_square_rank = chess.square_rank(move.to_square)
    
    # Use attackers() to determine if the square is attacked by opponents
    opponent_color = not piece.color
    opponent_attackers = board_after.attackers(opponent_color, move.to_square)
    
    # Only proceed if landing square is safe according to criteria
    if opponent_attackers:
        # Check safety exception conditions
        # [...implementation for safety exception...]
        if not safe_exception:
            return None
    
    # Multiple Targets: Find newly attacked pieces
    newly_attacked_pieces = []
    
    # [...implementation to find multiple attacked pieces...]
    
    # Apply value exception criteria
    # [...implementation for value exception...]
    
    if len(newly_attacked_pieces) >= 2:
        return TacticalMotif(
            motif_type="fork",
            # [...other fields...]
        )
    
    return None
```

2. **Ensure Proper Board State Handling**:
   - Fix the board state handling to correctly assess before/after positions
   - Ensure move legality is always checked
   - Handle special moves (castling, en-passant, promotion) correctly

## 3. Performance Improvements

1. **Implement Caching**:
   - Add position hash-based caching to avoid redundant analysis
   - Cache common tactical patterns
   - Use incremental board updates where possible

```python
# Add to StockfishService
def __init__(self):
    # Existing initialization
    self._analysis_cache = {}  # Simple position cache

async def evaluate_position(self, fen: str, depth: Optional[int] = None, engine_index: int = 0) -> Dict:
    # Check cache first
    cache_key = f"{fen}_depth{depth or self.depth}"
    if cache_key in self._analysis_cache:
        return self._analysis_cache[cache_key]
    
    # Existing evaluation code
    result = {...}  # Existing result
    
    # Store in cache
    self._analysis_cache[cache_key] = result
    
    return result
```

2. **Optimize Square Control Calculation**:
   - Use python-chess's built-in attackers() method more efficiently
   - Implement incremental updates for control metrics
   - Reduce redundant calculations

## 4. Specific Code Implementation Plan

### 1. Update Core Configuration:
- Update `app/core/config.py` to set default depth to 20 instead of 12

### 2. Fix StockfishService:
- Modify `app/services/stockfish.py` to:
  - Update the default depth to 20
  - Fix error handling
  - Optimize engine communication

### 3. Improve TacticsService:
- Update `app/services/tactics.py` to:
  - Reimplement tactics detection to match specifications
  - Fix square control calculation
  - Ensure tactical motifs only check best moves

### 4. Enhance AnalysisService:
- Update `app/services/analysis.py` to:
  - Add NAG standardization
  - Fix evaluation calculations
  - Improve move classification

### 5. Fix API Routes:
- Update `app/api/routes/analysis.py` to:
  - Remove the non-functional game endpoint
  - Standardize parameters
  - Fix database operations

### 6. Test and Validate:
- Create test cases for each tactical pattern
- Verify calculation of square control metrics
- Test best move identification
- Validate evaluation changes

## 5. Action Items Prioritized

1. Update the standardized depth from 12 to 20 in all relevant places
2. Fix the fundamental StockfishService to ensure consistent analysis
3. Correct the tactics detection to follow the specification exactly
4. Implement standard NAG annotations for moves
5. Fix API routes for consistency and database operations
6. Perform thorough testing of all components