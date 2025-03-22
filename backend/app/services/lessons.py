import io
import chess
import chess.pgn
import logging
from typing import Dict, List, Optional, Tuple, Any

from app.db.supabase import get_supabase_client
from app.services.stockfish import stockfish_service
from app.services.tactics import tactics_service

logger = logging.getLogger(__name__)


class LessonService:
    """Service for generating and managing chess lessons."""

    def __init__(self):
        """Initialize the lesson service."""
        self.tactic_descriptions = {
            "fork": "A fork is a tactic where a single piece attacks two or more opponent pieces simultaneously.",
            "pin": "A pin restricts an opponent's piece from moving because doing so would expose a more valuable piece to capture.",
            "skewer": "A skewer is similar to a pin, but the more valuable piece is in front and forced to move, exposing a less valuable piece behind it.",
            "discovered_check": "A discovered check occurs when a piece moves away from a line, revealing an attack on the opponent's king.",
            "double_check": "A double check is a special check where two pieces attack the king simultaneously.",
            "mate_threat": "A mate threat is a move that threatens checkmate on the next move.",
            "interference": "Interference involves placing a piece between an opponent's piece and its intended destination or line of action.",
            "overloaded_piece": "An overloaded piece is one that is defending multiple targets and cannot adequately protect all of them.",
            "trapped_piece": "A trapped piece is one that has limited or no available moves and is at risk of capture.",
            "zwischenzug": "A zwischenzug (German for 'in-between move') is an intermediate move that changes the situation to a player's advantage.",
        }

    async def get_player_lessons(self, player_id: str, limit: int = 20) -> List[Dict]:
        """Retrieve existing lessons for a player."""
        supabase = get_supabase_client()
        response = (
            supabase.table("player_lessons")
            .select("*")
            .eq("player_id", player_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data

    async def get_player_games(self, player_id: str, limit: int = 10) -> List[Dict]:
        """Retrieve recent games for a player."""
        supabase = get_supabase_client()
        response = (
            supabase.table("games")
            .select("*")
            .eq("user_id", player_id)
            .eq(
                "enhanced_analyzed", True
            )  # Only analyze games that have enhanced analysis
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data

    async def get_game_blunders(self, game_id: str, player_id: str) -> List[Dict]:
        """Find blunders in a game for the specified player."""
        supabase = get_supabase_client()

        # First get the game to determine player color
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()

        if not game_response.data:
            logger.warning(f"Game {game_id} not found")
            return []

        game = game_response.data[0]
        pgn = game.get("pgn") or game.get("moves_only", "")

        if not pgn:
            logger.warning(f"Game {game_id} has no PGN data")
            return []

        # Get enhanced annotations to find blunders
        annotation_response = (
            supabase.table("enhanced_move_annotations")
            .select("*")
            .eq("game_id", game_id)
            .order("move_number")
            .execute()
        )

        if not annotation_response.data:
            logger.warning(f"Game {game_id} has no enhanced annotations")
            return []

        # Find blunders (mistakes and blunders with significant eval change)
        blunders = []
        for annotation in annotation_response.data:
            # Only look at the player's moves
            if game["user_id"] == player_id and annotation["classification"] in [
                "blunder",
                "mistake",
            ]:
                # Get the FEN before the move
                fen_before = annotation["fen_before"]

                # Use stockfish to find the best move at this position
                try:
                    best_move_data = await stockfish_service.get_best_move_at_depth(
                        fen_before, 20
                    )

                    if best_move_data and best_move_data["best_move"]:
                        # Check if the best move had tactical motifs
                        board = chess.Board(fen_before)
                        best_move = chess.Move.from_uci(best_move_data["best_move"])

                        # Create a copy to analyze the position after the best move
                        board_copy = board.copy()
                        board_copy.push(best_move)

                        # Analyze for tactics
                        tactical_motifs = tactics_service.analyze_move_for_tactics(
                            board, board_copy, best_move, is_best_move=True
                        )

                        if tactical_motifs:
                            # This blunder had a tactical opportunity that was missed
                            blunder_data = {
                                "game_id": game_id,
                                "move_number": annotation["move_number"],
                                "fen": fen_before,
                                "best_move": best_move_data["best_move"],
                                "best_move_san": board.san(best_move),
                                "played_move": annotation["move_uci"],
                                "played_move_san": annotation["move_san"],
                                "eval_change": annotation["evaluation_change"],
                                "tactical_motifs": tactical_motifs,
                                "is_mate": best_move_data.get("is_mate", False),
                            }
                            blunders.append(blunder_data)
                except Exception as e:
                    logger.error(
                        f"Error analyzing position for game {game_id}, move {annotation['move_number']}: {str(e)}"
                    )
                    continue

        return blunders

    def generate_lesson(self, blunder_data: Dict) -> Dict:
        """Generate a lesson from a blunder."""
        # Extract primary tactic type
        primary_tactic = None
        if blunder_data.get("tactical_motifs"):
            for motif in blunder_data["tactical_motifs"]:
                primary_tactic = motif.motif_type
                break

        # Generate title
        if blunder_data.get("is_mate"):
            title = "Missed Checkmate Opportunity"
        elif primary_tactic:
            title = f"Missed {primary_tactic.replace('_', ' ').title()} Opportunity"
        else:
            title = "Missed Tactical Opportunity"

        # Generate content
        content_lines = []
        content_lines.append(
            f"In this position, you played {blunder_data['played_move_san']}."
        )
        content_lines.append(
            f"However, there was a stronger move: {blunder_data['best_move_san']}."
        )

        # Add tactic descriptions
        if primary_tactic and primary_tactic in self.tactic_descriptions:
            content_lines.append("\n" + self.tactic_descriptions[primary_tactic])
            content_lines.append(
                f"Let's see how {blunder_data['best_move_san']} creates a {primary_tactic.replace('_', ' ')}:"
            )

        # Add evaluation explanation
        if blunder_data.get("is_mate"):
            content_lines.append("\nThis move would have led to a checkmate sequence!")
        else:
            eval_change = abs(blunder_data["eval_change"])
            content_lines.append(
                f"\nThis move would have given you a significant advantage of approximately {eval_change:.1f} pawns."
            )

        # Create exercise
        exercise = {
            "fen": blunder_data["fen"],
            "question": "What is the best move in this position?",
            "answer": blunder_data["best_move_san"],
            "hints": [],
        }

        if primary_tactic:
            exercise["hints"].append(f"Look for a {primary_tactic.replace('_', ' ')}.")

        # Assemble lesson
        lesson = {
            "type": "tactical",
            "title": title,
            "content": "\n".join(content_lines),
            "position_fen": blunder_data["fen"],
            "exercises": [exercise],
            "associated_game_id": blunder_data["game_id"],
            "move_number": blunder_data["move_number"],
        }

        return lesson

    async def store_lesson(self, player_id: str, lesson_data: Dict) -> Dict:
        """Store a generated lesson in the database."""
        supabase = get_supabase_client()

        # Check if a similar lesson already exists
        existing_response = (
            supabase.table("player_lessons")
            .select("id")
            .eq("player_id", player_id)
            .eq("position_fen", lesson_data["position_fen"])
            .eq("associated_game_id", lesson_data["associated_game_id"])
            .execute()
        )

        # Don't create duplicates
        if existing_response.data:
            logger.info(
                f"Lesson for position {lesson_data['position_fen']} from game {lesson_data['associated_game_id']} already exists"
            )
            return existing_response.data[0]

        lesson_record = {
            "player_id": player_id,
            "lesson_type": lesson_data["type"],
            "title": lesson_data["title"],
            "content": lesson_data["content"],
            "position_fen": lesson_data["position_fen"],
            "exercises": lesson_data["exercises"],
            "associated_game_id": lesson_data["associated_game_id"],
            "move_number": lesson_data["move_number"],
        }

        response = supabase.table("player_lessons").insert(lesson_record).execute()

        if response.data:
            return response.data[0]
        return None

    async def complete_lesson(
        self, lesson_id: str, score: Optional[int] = None
    ) -> bool:
        """Mark a lesson as completed with an optional score."""
        supabase = get_supabase_client()

        update_data = {"completed": True}
        if score is not None:
            update_data["score"] = score

        response = (
            supabase.table("player_lessons")
            .update(update_data)
            .eq("id", lesson_id)
            .execute()
        )

        return len(response.data) > 0

    async def get_recommended_lessons(
        self, player_id: str, limit: int = 3
    ) -> List[Dict]:
        """Get personalized lesson recommendations for a player."""
        supabase = get_supabase_client()

        # First get incomplete lessons
        response = (
            supabase.table("player_lessons")
            .select("*")
            .eq("player_id", player_id)
            .eq("completed", False)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        return response.data


# Create a singleton instance
lesson_service = LessonService()
