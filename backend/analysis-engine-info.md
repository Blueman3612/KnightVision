# Knight Vision Chess Analysis Engine Information

## Current State Assessment

Based on the documentation provided in analysis-engine.md and SUMMARY.md, the Knight Vision chess analysis engine appears to have a solid conceptual foundation but several implementation issues that need addressing. You've made some changes, but fixes haven't been started yet.

### Key Components
- **Position Analysis Engine**: FEN parsing and Stockfish integration
- **Game Analysis Engine**: PGN parsing and move evaluation
- **Square Control System**: 8×8 grid tracking piece influence metrics
- **Tactical Pattern Detection**: Algorithms for forks, pins, skewers, and discovered checks

### Critical Issues
1. **API Route Problems**:
   - `/analysis/game` endpoint is non-functional and marked for removal
   - `/analysis/game/{game_id}` has database inconsistencies
   - `/analysis/{game_id}/enhanced-annotate` appears to be the main working route

2. **Integration Issues**:
   - Unclear how python-chess is currently integrated
   - No standardized approach to Stockfish engine communication
   - Missing proper NAG annotations for move quality

3. **Tactical Detection Approach**:
   - Not exclusively focusing on Stockfish's best moves for tactical opportunities
   - Current code may be identifying suboptimal tactical patterns

## Implementation Priorities

### 1. Core Engine Functionality
- **Properly integrate python-chess for board representation and move generation**
- **Standardize Stockfish communication using python-chess engine module**
- **Implement proper move evaluation with standard NAG annotations**
- **Use evaluation depth of 20 for all Stockfish analysis**

### 2. Tactical Analysis Refinement
- **Only analyze Stockfish's best moves for tactical patterns**
- **Refine algorithms to reliably identify forks, pins, and skewers**
- **Ensure all tactical detection follows the criteria in the documentation**

### 3. API Consistency
- **Standardize API routes with clear responsibilities**
- **Fix database update operations**
- **Ensure proper error handling for all endpoints**

## Python-chess Integration Plan

```python
# Key components needed in the refactored code
import chess
import chess.engine
import chess.pgn
from chess.pgn import NAG_GOOD_MOVE, NAG_MISTAKE, NAG_BRILLIANT_MOVE, NAG_BLUNDER

# Engine initialization
async def initialize_engine(stockfish_path):
    transport, engine = await chess.engine.popen_uci(stockfish_path)
    return transport, engine

# Position analysis with focus on Stockfish's best move for tactics
async def analyze_position(engine, fen, depth=20):
    board = chess.Board(fen)
    
    # Get Stockfish analysis at standard depth of 20
    result = await engine.analyse(board, chess.engine.Limit(depth=depth))
    
    # Get best move from analysis
    best_move = result.get("pv")[0] if "pv" in result and result["pv"] else None
    
    # Only detect tactics on Stockfish's best move
    tactics = {}
    if best_move:
        tactics = detect_tactics(board, best_move)
    
    return {
        "evaluation": result["score"].relative.score(mate_score=10000),
        "best_move": best_move.uci() if best_move else None,
        "tactics": tactics
    }

# NAG annotation based on evaluation change
def get_move_quality_nag(prev_eval, current_eval):
    eval_change = current_eval - prev_eval
    
    if eval_change < -200:
        return NAG_BLUNDER
    elif eval_change < -100:
        return NAG_MISTAKE
    elif eval_change > 200:
        return NAG_BRILLIANT_MOVE
    elif eval_change > 100:
        return NAG_GOOD_MOVE
    
    return None
```

## Square Control Implementation

The 8×8 grid system for tracking piece influence should be implemented with direct integration to python-chess's built-in functionality:

```python
def calculate_square_control(board):
    """Calculate square control metrics for both players"""
    white_control = [[0 for _ in range(8)] for _ in range(8)]
    black_control = [[0 for _ in range(8)] for _ in range(8)]
    white_control_material = [[0 for _ in range(8)] for _ in range(8)]
    black_control_material = [[0 for _ in range(8)] for _ in range(8)]
    
    # Material values
    piece_values = {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
        chess.KING: 0  # Not counted in material but tracked for control
    }
    
    # Calculate control for each square
    for square in chess.SQUARES:
        file_idx = chess.square_file(square)
        rank_idx = chess.square_rank(square)
        
        # Check white attackers
        attackers = board.attackers(chess.WHITE, square)
        for attacker in attackers:
            white_control[rank_idx][file_idx] += 1
            piece_type = board.piece_type_at(attacker)
            white_control_material[rank_idx][file_idx] += piece_values.get(piece_type, 0)
        
        # Check black attackers
        attackers = board.attackers(chess.BLACK, square)
        for attacker in attackers:
            black_control[rank_idx][file_idx] += 1
            piece_type = board.piece_type_at(attacker)
            black_control_material[rank_idx][file_idx] += piece_values.get(piece_type, 0)
    
    return {
        "white_control": white_control,
        "black_control": black_control,
        "white_control_material": white_control_material,
        "black_control_material": black_control_material
    }
```

## Tactical Detection Implementation

For tactical pattern detection focused exclusively on Stockfish's best moves:

```python
def detect_tactics(board, move):
    """Detect tactical patterns that would result from playing the given move"""
    tactics = {
        "fork": False,
        "pin": False,
        "skewer": False, 
        "discovered_check": False
    }
    
    # Store original position
    original = board.copy()
    
    # Play the move
    board.push(move)
    
    # Check for fork
    tactics["fork"] = detect_fork(board, move)
    
    # Check for pin
    tactics["pin"] = detect_pin(board, move)
    
    # Check for skewer
    tactics["skewer"] = detect_skewer(board, move)
    
    # Check for discovered check
    tactics["discovered_check"] = detect_discovered_check(board, move)
    
    # Restore original position
    board.set_fen(original.fen())
    
    return tactics
```

## Stockfish Analysis Class Implementation

```python
class StockfishAnalyzer:
    def __init__(self, stockfish_path):
        self.stockfish_path = stockfish_path
        self.engine = None
        self.transport = None
        self.evaluation_depth = 20  # Standardized depth of 20 for all analyses
    
    async def initialize(self):
        """Initialize Stockfish engine connection"""
        self.transport, self.engine = await chess.engine.popen_uci(self.stockfish_path)
    
    async def analyze_position(self, fen):
        """Analyze a chess position with standard depth"""
        board = chess.Board(fen)
        result = await self.engine.analyse(
            board,
            chess.engine.Limit(depth=self.evaluation_depth)
        )
        
        # Extract best move and evaluation
        best_move = result.get("pv")[0] if "pv" in result and len(result["pv"]) > 0 else None
        score = result["score"].relative.score(mate_score=10000)
        
        # Only detect tactics for best move
        tactics = {}
        if best_move:
            tactics = detect_tactics(board, best_move)
        
        return {
            "fen": fen,
            "evaluation": score,
            "best_move": best_move.uci() if best_move else None,
            "best_move_san": board.san(best_move) if best_move else None,
            "tactics": tactics,
            "square_control": calculate_square_control(board)
        }
    
    async def close(self):
        """Clean up resources"""
        if self.engine:
            await self.engine.quit()
```

## Next Steps

1. **Start with fixing the core Stockfish integration**:
   - Implement proper engine communication through python-chess
   - Ensure consistent evaluation depth of 20 for all analyses
   - Correctly extract and interpret evaluation scores

2. **Implement standardized NAG annotations**:
   - Use python-chess's built-in NAG constants
   - Create clear thresholds for different move classifications

3. **Fix tactical detection to focus on best moves**:
   - Modify algorithms to only analyze Stockfish's recommended moves
   - Implement the detection criteria as specified in the documentation

4. **Standardize API routes**:
   - Clean up inconsistent endpoints
   - Fix database operations
   - Add proper validation and error handling

After functionality is working correctly, focus can shift to performance optimizations and scalability improvements.
