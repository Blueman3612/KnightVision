# Lessons Engine Report

## Overview

This report outlines the approach for creating a personalized chess lessons system based on player blunders. The system will analyze a player's games, identify missed tactical opportunities, and generate tailored lessons that focus on improving specific weaknesses.

## Architecture

### Component Structure

The lessons engine will consist of:

1. **Lessons API Route** (`lessons.py`): Separate from tactics to minimize merge conflicts
2. **Database Access Layer**: For retrieving player games and storing generated lessons
3. **Blunder Analysis Service**: To identify learning opportunities from games
4. **Lesson Generation Engine**: To create appropriate educational content
5. **Tactics Integration**: Leveraging the existing tactics service

### Workflow

1. Player requests personalized lessons
2. System retrieves player's recent games from Supabase
3. Identifies blunders where tactics were missed
4. Generates appropriate lesson content
5. Returns tailored lesson data

## Implementation Plan

### 1. Database Integration

```python
from supabase import create_client
import chess.pgn
import io

class LessonDatabaseService:
    def __init__(self, supabase_url, supabase_key):
        self.supabase = create_client(supabase_url, supabase_key)
    
    def get_player_games(self, player_id, limit=10):
        """Retrieve recent games for a player"""
        response = (self.supabase
            .table('games')
            .select('*')
            .filter('player_id', 'eq', player_id)
            .order('created_at', desc=True)
            .limit(limit)
            .execute())
        
        return response.data
    
    def get_enhanced_annotations(self, game_id):
        """Get enhanced annotations for a game"""
        response = (self.supabase
            .table('enhanced_move_annotations')
            .select('*')
            .filter('game_id', 'eq', game_id)
            .execute())
        
        return response.data
    
    def store_lesson(self, player_id, lesson_data):
        """Store generated lesson in database"""
        response = (self.supabase
            .table('player_lessons')
            .insert({
                'player_id': player_id,
                'lesson_type': lesson_data['type'],
                'content': lesson_data['content'],
                'position_fen': lesson_data['fen'],
                'associated_game_id': lesson_data['game_id'],
                'move_number': lesson_data['move_number']
            })
            .execute())
        
        return response.data
```

### 2. Blunder Analysis Service

```python
import chess
import chess.pgn
import chess.engine
from chess.pgn import NAG_BLUNDER, NAG_MISTAKE

class BlunderAnalysisService:
    def __init__(self, stockfish_path, tactics_service):
        self.stockfish_path = stockfish_path
        self.tactics_service = tactics_service
        self.evaluation_depth = 20
    
    async def initialize(self):
        """Initialize the Stockfish engine"""
        self.transport, self.engine = await chess.engine.popen_uci(self.stockfish_path)
    
    async def find_player_blunders(self, pgn_text, player_color):
        """Find significant blunders in a game for a specific player"""
        pgn = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn)
        
        blunders = []
        board = game.board()
        
        for move_number, node in enumerate(game.mainline(), 1):
            # Only analyze moves by the specified player
            if (player_color == chess.WHITE and board.turn == chess.WHITE) or \
               (player_color == chess.BLACK and board.turn == chess.BLACK):
                
                # Get all legal moves from current position
                legal_moves = list(board.legal_moves)
                
                # Get Stockfish's recommended move
                result = await self.engine.analyse(
                    board, 
                    chess.engine.Limit(depth=self.evaluation_depth)
                )
                best_move = result.get("pv")[0] if "pv" in result and result["pv"] else None
                
                # If player's move differs from best move significantly
                if node.move != best_move:
                    # Evaluate position before move
                    pre_eval = result["score"].relative.score(mate_score=10000)
                    
                    # Make player's actual move
                    board.push(node.move)
                    
                    # Evaluate position after move
                    after_result = await self.engine.analyse(
                        board, 
                        chess.engine.Limit(depth=self.evaluation_depth)
                    )
                    post_eval = after_result["score"].relative.score(mate_score=10000)
                    
                    # Calculate evaluation change
                    eval_change = post_eval - pre_eval
                    
                    # Identify significant blunders (negative change for the player)
                    if (player_color == chess.WHITE and eval_change < -150) or \
                       (player_color == chess.BLACK and eval_change > 150):
                        
                        # Check if best move had a tactical motif
                        original_board = board.copy()
                        board.pop()  # Undo the player's move
                        
                        tactics = self.tactics_service.detect_tactics(board, best_move)
                        
                        if any(tactics.values()):  # If any tactical motif was detected
                            blunders.append({
                                'move_number': move_number,
                                'fen': board.fen(),
                                'best_move': best_move,
                                'best_move_san': board.san(best_move),
                                'played_move': node.move,
                                'played_move_san': board.san(node.move),
                                'eval_change': eval_change,
                                'tactics': tactics,
                                'is_mate': result["score"].is_mate()
                            })
                        
                        # Restore the board to continue analysis
                        board = original_board
                    else:
                        # If not a blunder, just continue with the game
                        continue
                
            # Play the move to continue
            board.push(node.move)
        
        return blunders
    
    async def close(self):
        """Clean up resources"""
        if hasattr(self, 'engine') and self.engine:
            await self.engine.quit()
```

### 3. Lesson Generation Engine

```python
class LessonGenerator:
    def __init__(self):
        self.tactic_descriptions = {
            'fork': "A fork is a tactic where a single piece attacks two or more opponent pieces simultaneously.",
            'pin': "A pin restricts an opponent's piece from moving because doing so would expose a more valuable piece to capture.",
            'skewer': "A skewer is similar to a pin, but the more valuable piece is in front and forced to move, exposing a less valuable piece behind it.",
            'discovered_check': "A discovered check occurs when a piece moves away from a line, revealing an attack on the opponent's king."
        }
    
    def generate_lesson(self, blunder_data):
        """Generate a lesson from a blunder"""
        lesson = {
            'type': 'tactical',
            'fen': blunder_data['fen'],
            'title': self._generate_title(blunder_data),
            'content': self._generate_content(blunder_data),
            'exercises': self._generate_exercises(blunder_data),
            'game_id': blunder_data.get('game_id'),
            'move_number': blunder_data['move_number']
        }
        return lesson
    
    def _generate_title(self, blunder_data):
        """Generate an appropriate title for the lesson"""
        # Find the primary tactic
        primary_tactic = None
        for tactic, present in blunder_data['tactics'].items():
            if present:
                primary_tactic = tactic
                break
        
        if blunder_data['is_mate']:
            return f"Missed Checkmate Opportunity"
        elif primary_tactic:
            return f"Missed {primary_tactic.title()} Opportunity"
        else:
            return "Missed Tactical Opportunity"
    
    def _generate_content(self, blunder_data):
        """Generate explanatory content for the lesson"""
        content = []
        
        # Introduction
        content.append("In this position, you played " + blunder_data['played_move_san'] + ".")
        content.append("However, there was a stronger move: " + blunder_data['best_move_san'] + ".")
        
        # Explain the tactic
        for tactic, present in blunder_data['tactics'].items():
            if present:
                content.append("\n" + self.tactic_descriptions[tactic])
                content.append(f"Let's see how {blunder_data['best_move_san']} creates a {tactic}:")
        
        # Evaluation explanation
        if blunder_data['is_mate']:
            content.append("\nThis move would have led to a checkmate sequence!")
        else:
            content.append(f"\nThis move would have given you a significant advantage of approximately {abs(blunder_data['eval_change'])/100} pawns.")
        
        return "\n".join(content)
    
    def _generate_exercises(self, blunder_data):
        """Generate practice exercises based on the blunder"""
        # Create a simple exercise asking to find the best move
        exercise = {
            'fen': blunder_data['fen'],
            'question': "What is the best move in this position?",
            'answer': blunder_data['best_move_san'],
            'hints': []
        }
        
        # Add hints based on the tactics
        for tactic, present in blunder_data['tactics'].items():
            if present:
                exercise['hints'].append(f"Look for a {tactic}.")
        
        return [exercise]
```

### 4. API Route Implementation (lessons.py)

```python
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Optional
from pydantic import BaseModel

# Import services
# from .dependencies import get_db_service, get_blunder_service, get_tactics_service

router = APIRouter(
    prefix="/lessons",
    tags=["lessons"],
    responses={404: {"description": "Not found"}},
)

class LessonRequest(BaseModel):
    player_id: str
    game_limit: Optional[int] = 10

class LessonResponse(BaseModel):
    id: Optional[str]
    type: str
    title: str
    content: str
    fen: str
    exercises: List[dict]

@router.get("/{player_id}", response_model=List[LessonResponse])
async def get_player_lessons(
    player_id: str,
    db_service = Depends(get_db_service)
):
    """Retrieve existing lessons for a player"""
    lessons = db_service.get_player_lessons(player_id)
    return lessons

@router.post("/generate", response_model=List[LessonResponse])
async def generate_lessons(
    request: LessonRequest,
    background_tasks: BackgroundTasks,
    db_service = Depends(get_db_service),
    blunder_service = Depends(get_blunder_service),
    lesson_generator = Depends(get_lesson_generator)
):
    """Generate new lessons for a player based on their games"""
    # 1. Retrieve player's recent games
    games = db_service.get_player_games(request.player_id, request.game_limit)
    
    if not games:
        raise HTTPException(status_code=404, detail="No games found for player")
    
    # 2. For each game, find blunders
    all_lessons = []
    
    for game in games:
        # Determine player color
        player_color = chess.WHITE if game['player_side'] == 'white' else chess.BLACK
        
        # Find blunders
        blunders = await blunder_service.find_player_blunders(game['pgn'], player_color)
        
        # Generate lessons from blunders
        for blunder in blunders:
            blunder['game_id'] = game['id']
            lesson = lesson_generator.generate_lesson(blunder)
            
            # Store lesson in database (background task to improve response time)
            background_tasks.add_task(db_service.store_lesson, request.player_id, lesson)
            
            all_lessons.append(lesson)
    
    # Return the newly generated lessons
    return all_lessons

@router.get("/recommendation/{player_id}", response_model=List[LessonResponse])
async def get_lesson_recommendations(
    player_id: str,
    limit: Optional[int] = 3,
    db_service = Depends(get_db_service)
):
    """Get personalized lesson recommendations for a player"""
    # Logic to retrieve and rank lessons by relevance
    # This could consider frequency of similar blunders, recency, etc.
    recommended_lessons = db_service.get_recommended_lessons(player_id, limit)
    return recommended_lessons
```

## Integration with Existing Tactics Service

To leverage the existing tactics service while keeping the code separate:

1. **Dependency Injection**:
   ```python
   # in dependencies.py
   def get_tactics_service():
       from app.tactics.service import TacticsService
       return TacticsService()
   ```

2. **Interface Agreement**:
   Define a clear interface that the tactics service should expose:
   ```python
   # Expected interface
   def detect_tactics(board, move):
       """
       Inputs:
       - board: A chess.Board object with the current position
       - move: A chess.Move object representing the candidate move to analyze
       
       Returns:
       - dict: {
           'fork': bool,
           'pin': bool, 
           'skewer': bool,
           'discovered_check': bool
       }
       """
       pass
   ```

3. **Fallback Implementation**:
   ```python
   # In case the interface changes
   class TacticsServiceAdapter:
       def __init__(self, tactics_service):
           self.tactics_service = tactics_service
       
       def detect_tactics(self, board, move):
           """Adapter to ensure consistent interface"""
           result = self.tactics_service.analyze_tactics(board, move)
           # Transform result to expected format if needed
           return {
               'fork': result.get('fork', False),
               'pin': result.get('pin', False),
               'skewer': result.get('skewer', False),
               'discovered_check': result.get('discovered_check', False)
           }
   ```

## Python-chess Helpful Methods

The following python-chess methods will be particularly useful for this implementation:

1. **Board representation and manipulation**:
   - `chess.Board()` - Create a board from the starting position
   - `chess.Board(fen)` - Create a board from a FEN string
   - `board.push(move)` - Make a move on the board
   - `board.pop()` - Undo the last move
   - `board.copy()` - Create a copy of the current board position

2. **Move generation and validation**:
   - `board.legal_moves` - Iterator over legal moves
   - `board.is_capture(move)` - Check if a move is a capture
   - `board.is_check()` - Check if the current position is check
   - `board.san(move)` - Convert a move to Standard Algebraic Notation

3. **Analysis with Stockfish**:
   - `chess.engine.popen_uci()` - Start a UCI engine process
   - `engine.analyse()` - Get a detailed analysis of a position
   - `result["score"]` - Get the evaluation score
   - `result["pv"]` - Get the principal variation (best line)

4. **Tactical detection helpers**:
   - `board.attackers(color, square)` - Get pieces attacking a square
   - `board.is_attacked_by(color, square)` - Check if a square is attacked
   - `board.pin(color, square)` - Get ray from king if pinned

## Lesson Content Approach

Effective chess lessons should follow these principles:

1. **Contextual learning**: Use the player's own games to teach concepts
2. **Focus on patterns**: Emphasize tactical patterns rather than specific positions
3. **Interactive exercises**: Include practice positions based on the tactical theme
4. **Progressive difficulty**: Start with simpler tactical patterns before complex ones
5. **Feedback loop**: Track improvement in avoiding similar blunders in future games

## API Best Practices

1. **Separation of concerns**:
   - Keep the lessons API separate from tactics to minimize conflicts
   - Use dependency injection for shared services

2. **Asynchronous processing**:
   - Use background tasks for time-consuming operations
   - Generate lessons asynchronously for better user experience

3. **Caching strategy**:
   - Cache generated lessons to avoid redundant analysis
   - Invalidate cache when new games are played

4. **Rate limiting**:
   - Limit lesson generation requests to prevent abuse
   - Consider using a queue for bulk processing

5. **API documentation**:
   - Document all endpoints with OpenAPI/Swagger
   - Include example requests and responses

## Conclusion

The proposed lessons engine provides a comprehensive approach to generating personalized chess lessons based on a player's blunders. By leveraging the existing tactics service and implementing a separate lessons module, the system can identify learning opportunities and create tailored content without creating version control conflicts.

The implementation follows modern API design principles and utilizes python-chess's capabilities for position analysis and tactical detection. The modular architecture allows for future expansion to include additional lesson types beyond tactical patterns.
