import io
import logging
from typing import Dict, List, Optional, Union

import chess
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.db.supabase import get_current_user, get_supabase_client
from app.models.analysis import (GameAnalysisResult, MoveAnalysis,
                                 PositionAnalysis)
from app.services.analysis import analysis_service

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()


class PositionAnalysisRequest(BaseModel):
    """Request model for position analysis."""

    fen: str = Field(..., description="FEN notation of the position to evaluate")
    depth: Optional[int] = Field(None, description="Search depth (defaults to 20)")


# GameAnalysisRequest removed as its endpoint was removed
# Use the /game/{game_id} endpoint with authentication instead


@router.post("/position", response_model=PositionAnalysis)
async def analyze_position(request: PositionAnalysisRequest):
    """
    Analyze a chess position with enhanced metrics including square control and tactical motifs.

    Args:
        request: Position analysis request with FEN and options

    Returns:
        PositionAnalysis: Detailed position analysis with square control metrics and tactical motifs
    """
    logger.info(f"Analyzing position: {request.fen}")
    try:
        # Validate FEN format
        try:
            import chess

            chess.Board(request.fen)  # Will raise ValueError if FEN is invalid
        except ValueError as fen_error:
            logger.warning(f"Invalid FEN format: {request.fen} - {str(fen_error)}")
            raise HTTPException(
                status_code=400, detail=f"Invalid FEN format: {str(fen_error)}"
            )

        # Validate depth if provided
        if request.depth is not None and (request.depth < 1 or request.depth > 30):
            logger.warning(f"Invalid depth: {request.depth}")
            raise HTTPException(
                status_code=400, detail="Depth must be between 1 and 30"
            )

        # Perform the analysis with standardized depth
        result = await analysis_service.analyze_position(request.fen, request.depth)

        logger.info(f"Position analysis complete: {request.fen}")
        return result

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error analyzing position: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis engine error: {str(e)}")


# Endpoint removed as per Phase 3 requirements in analysis-engine-overhaul.md
# This endpoint is replaced by the more secure /game/{game_id} endpoint
# which includes proper authentication and database integration


@router.get("/game/{game_id}", response_model=GameAnalysisResult)
async def analyze_game_by_id(
    game_id: str,
    depth: Optional[int] = Query(None, description="Search depth (defaults to 20)"),
    user_id: str = Depends(get_current_user),
):
    """
    Analyze a chess game by retrieving its PGN from the database.
    This endpoint avoids JSON escaping issues by getting the PGN directly from the database.

    Args:
        game_id: ID of the game to analyze
        depth: Search depth (defaults to 20)
        user_id: Current authenticated user

    Returns:
        GameAnalysisResult: Complete game analysis with tactical and positional insights
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to analyze games"
        )

    supabase = get_supabase_client()

    try:
        # Get the game from the database
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()

        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, detail=f"Game with ID {game_id} not found"
            )

        game = game_response.data[0]

        # Check if game belongs to the user
        if game.get("user_id") != user_id:
            raise HTTPException(
                status_code=403, detail="You don't have permission to analyze this game"
            )

        # Get the PGN from the game
        pgn = game.get("pgn") or game.get("moves_only", "")
        if not pgn:
            raise HTTPException(
                status_code=400,
                detail="Game does not contain valid PGN data required for analysis",
            )

        # Analyze the game
        result = await analysis_service.analyze_game(pgn, depth, game_id)

        return result
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error analyzing game {game_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis engine error: {str(e)}")


@router.post("/{game_id}/enhanced-annotate", response_model=GameAnalysisResult)
async def enhanced_annotate_game(
    game_id: str, user_id: str = Depends(get_current_user)
):
    """
    Analyze and annotate a specific chess game with enhanced tactical and positional metrics.

    Args:
        game_id: ID of the game to annotate
        user_id: Current authenticated user

    Returns:
        GameAnalysisResult: The enhanced annotated game
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Authentication required to annotate games"
        )

    supabase = get_supabase_client()

    try:
        # Get the game from the database
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()

        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, detail=f"Game with ID {game_id} not found"
            )

        game = game_response.data[0]

        # Check if game belongs to the user
        if game.get("user_id") != user_id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to annotate this game",
            )

        # Check if the game is already enhanced analyzed
        if game.get("enhanced_analyzed", False):
            # If already annotated, just return the existing annotations
            try:
                # Retrieve the enhanced annotations
                annotations_response = (
                    supabase.table("enhanced_move_annotations")
                    .select("*")
                    .eq("game_id", game_id)
                    .order("id")
                    .execute()
                )

                if len(annotations_response.data) > 0:
                    # Convert to MoveAnalysis objects
                    annotations = []

                    for annotation_data in annotations_response.data:
                        # Get tactical motifs
                        tactical_motifs_response = (
                            supabase.table("tactical_motifs")
                            .select("*")
                            .eq("annotation_id", annotation_data["id"])
                            .execute()
                        )

                        # Build the move analysis
                        move_analysis = MoveAnalysis(
                            move_uci=annotation_data["move_uci"],
                            move_san=annotation_data["move_san"],
                            move_number=annotation_data.get(
                                "move_number", 0
                            ),  # Default to 0 for backwards compatibility
                            fen_before=annotation_data["fen_before"],
                            fen_after=annotation_data["fen_after"],
                            evaluation_before=annotation_data["evaluation_before"],
                            evaluation_after=annotation_data["evaluation_after"],
                            evaluation_change=annotation_data["evaluation_change"],
                            classification=annotation_data["classification"],
                            is_best_move=annotation_data["is_best_move"],
                            is_book_move=annotation_data["is_book_move"],
                            # Convert tactical motifs
                            tactical_motifs=tactical_motifs_response.data,
                            # Parse square control
                            square_control_before=annotation_data[
                                "square_control_before"
                            ],
                            square_control_after=annotation_data[
                                "square_control_after"
                            ],
                            move_improvement=annotation_data.get("move_improvement"),
                        )

                        annotations.append(move_analysis)

                    # Get player weakness report
                    weakness_response = (
                        supabase.table("player_weakness_reports")
                        .select("*")
                        .eq("game_id", game_id)
                        .execute()
                    )

                    player_weaknesses = {
                        "tactical": [],
                        "positional": [],
                        "opening": [],
                        "endgame": [],
                    }
                    critical_positions = []

                    if len(weakness_response.data) > 0:
                        weakness_data = weakness_response.data[0]
                        player_weaknesses = {
                            "tactical": weakness_data.get("tactical_weakness", []),
                            "positional": weakness_data.get("positional_weakness", []),
                            "opening": weakness_data.get("opening_weakness", []),
                            "endgame": weakness_data.get("endgame_weakness", []),
                        }
                        critical_positions = weakness_data.get("critical_positions", [])

                    return GameAnalysisResult(
                        game_id=game_id,
                        total_moves=len(annotations),
                        annotations=annotations,
                        player_weaknesses=player_weaknesses,
                        critical_positions=critical_positions,
                    )
            except Exception as e:
                logger.warning(
                    f"Failed to retrieve existing enhanced annotations for game {game_id}: {e}"
                )
                # If there's an error retrieving annotations, proceed with re-analyzing

        # Parse the PGN
        pgn = game.get("pgn") or game.get("moves_only", "")
        if not pgn:
            raise HTTPException(
                status_code=400,
                detail="Game does not contain valid PGN data required for annotation",
            )

        # Perform the enhanced analysis
        analysis_result = await analysis_service.analyze_game(pgn=pgn, game_id=game_id)

        # Store enhanced annotations in the database using a more robust transaction approach
        successful_transaction = False
        db_error = None
        stored_annotation_ids = []

        try:
            # Phase 1: Clear any existing data for this game to avoid duplicates
            # We track each step for better error recovery
            logger.info(f"Cleaning up previous analysis data for game {game_id}")
            try:
                supabase.table("enhanced_move_annotations").delete().eq(
                    "game_id", game_id
                ).execute()
                supabase.table("player_weakness_reports").delete().eq(
                    "game_id", game_id
                ).execute()
                logger.info(
                    f"Successfully cleaned up previous analysis data for game {game_id}"
                )
            except Exception as cleanup_error:
                logger.error(
                    f"Failed to clean up previous analysis data: {cleanup_error}"
                )
                raise Exception(f"Database cleanup error: {cleanup_error}")

            # Phase 2: Store each move annotation
            logger.info(f"Storing {len(analysis_result.annotations)} move annotations")
            for annotation in analysis_result.annotations:
                try:
                    # Generate move improvement suggestions if not provided
                    if (
                        not annotation.move_improvement
                        and annotation.classification in ["mistake", "blunder"]
                    ):
                        if annotation.is_best_move:
                            move_improvement = (
                                "This was the best move despite the evaluation change."
                            )
                        else:
                            move_improvement = "Consider a different move."
                    else:
                        move_improvement = annotation.move_improvement or ""

                    # Determine the color of the player making this move
                    board = chess.Board(annotation.fen_before)
                    color = "white" if board.turn == chess.WHITE else "black"

                    # Convert annotation to dictionary for storage
                    annotation_dict = {
                        "game_id": game_id,
                        "move_uci": annotation.move_uci,
                        "move_san": annotation.move_san,
                        "move_number": annotation.move_number,
                        "color": color,
                        "fen_before": annotation.fen_before,
                        "fen_after": annotation.fen_after,
                        "evaluation_before": annotation.evaluation_before,
                        "evaluation_after": annotation.evaluation_after,
                        "evaluation_change": annotation.evaluation_change,
                        "classification": annotation.classification,
                        "is_best_move": annotation.is_best_move,
                        "is_book_move": annotation.is_book_move,
                        "best_move": annotation.best_move,
                        "move_improvement": move_improvement,
                        # Convert square control to JSON
                        "square_control_before": {
                            "white_control": annotation.square_control_before.white_control,
                            "black_control": annotation.square_control_before.black_control,
                            "white_control_material": annotation.square_control_before.white_control_material,
                            "black_control_material": annotation.square_control_before.black_control_material,
                            "white_legal_moves": annotation.square_control_before.white_legal_moves,
                            "black_legal_moves": annotation.square_control_before.black_legal_moves,
                        },
                        "square_control_after": {
                            "white_control": annotation.square_control_after.white_control,
                            "black_control": annotation.square_control_after.black_control,
                            "white_control_material": annotation.square_control_after.white_control_material,
                            "black_control_material": annotation.square_control_after.black_control_material,
                            "white_legal_moves": annotation.square_control_after.white_legal_moves,
                            "black_legal_moves": annotation.square_control_after.black_legal_moves,
                        },
                    }

                    # Insert annotation with better error handling
                    annotation_response = (
                        supabase.table("enhanced_move_annotations")
                        .insert(annotation_dict)
                        .execute()
                    )

                    # Get inserted annotation ID and store tactical motifs
                    if len(annotation_response.data) > 0:
                        annotation_id = annotation_response.data[0]["id"]
                        stored_annotation_ids.append(annotation_id)

                        # Store tactical motifs
                        if annotation.tactical_motifs:
                            for motif in annotation.tactical_motifs:
                                try:
                                    motif_dict = {
                                        "annotation_id": annotation_id,
                                        "motif_type": motif.motif_type,
                                        "piece": motif.piece,
                                        "piece_square": motif.piece_square,
                                        "targets": motif.targets,
                                        "move": motif.move,
                                        "description": motif.description,
                                    }

                                    supabase.table("tactical_motifs").insert(
                                        motif_dict
                                    ).execute()
                                except Exception as motif_err:
                                    logger.error(
                                        f"Failed to insert tactical motif {motif.motif_type}: {motif_err}"
                                    )
                                    # Continue with the next motif rather than failing the whole transaction
                    else:
                        logger.warning(
                            f"Failed to get ID for inserted annotation for move {annotation.move_san}"
                        )
                except Exception as annotation_err:
                    logger.error(
                        f"Failed to store annotation for move {annotation.move_san}: {annotation_err}"
                    )
                    # Continue with the next annotation rather than failing the whole transaction

            # Phase 3: Store player weakness report
            logger.info("Storing player weakness report")
            try:
                # Ensure all fields have values
                tactical_weakness = analysis_result.player_weaknesses.get(
                    "tactical", []
                )
                positional_weakness = analysis_result.player_weaknesses.get(
                    "positional", []
                )
                opening_weakness = analysis_result.player_weaknesses.get("opening", [])
                endgame_weakness = analysis_result.player_weaknesses.get("endgame", [])

                # Store player weakness report with default empty arrays for any missing data
                weakness_dict = {
                    "user_id": user_id,
                    "game_id": game_id,
                    "tactical_weakness": tactical_weakness if tactical_weakness else [],
                    "positional_weakness": (
                        positional_weakness if positional_weakness else []
                    ),
                    "opening_weakness": opening_weakness if opening_weakness else [],
                    "endgame_weakness": endgame_weakness if endgame_weakness else [],
                    "critical_positions": (
                        analysis_result.critical_positions
                        if analysis_result.critical_positions
                        else []
                    ),
                }

                weakness_response = (
                    supabase.table("player_weakness_reports")
                    .insert(weakness_dict)
                    .execute()
                )
                logger.info(f"Player weakness report stored successfully")
            except Exception as w_err:
                logger.error(f"Failed to store player weakness report: {w_err}")
                # Continue with updating game status rather than failing the whole transaction

            # Phase 4: Mark the game as enhanced analyzed
            logger.info(f"Updating game {game_id} status to enhanced_analyzed=True")
            supabase.table("games").update({"enhanced_analyzed": True}).eq(
                "id", game_id
            ).execute()

            # If we got here without exceptions, the transaction was successful
            successful_transaction = True
            logger.info(
                f"Successfully stored all enhanced annotations for game {game_id}"
            )

        except Exception as e:
            db_error = str(e)
            logger.error(
                f"Database transaction error while storing enhanced annotations: {db_error}"
            )

            # If we have partial data stored but the transaction failed overall,
            # attempt to clean up the orphaned data
            if stored_annotation_ids and not successful_transaction:
                logger.warning(
                    f"Transaction failed after storing {len(stored_annotation_ids)} annotations. Cleaning up orphaned data..."
                )
                try:
                    for annotation_id in stored_annotation_ids:
                        # Clean up tactical motifs first (foreign key constraint)
                        supabase.table("tactical_motifs").delete().eq(
                            "annotation_id", annotation_id
                        ).execute()
                    # Then clean up annotations
                    supabase.table("enhanced_move_annotations").delete().eq(
                        "game_id", game_id
                    ).execute()
                    logger.info(
                        "Successfully cleaned up orphaned data after failed transaction"
                    )
                except Exception as cleanup_err:
                    logger.error(f"Failed to clean up orphaned data: {cleanup_err}")

        # Add transaction status to the result for client-side error handling
        analysis_result.transaction_successful = successful_transaction
        if not successful_transaction and db_error:
            analysis_result.transaction_error = db_error

        # Even if storage fails, we still return the analysis result to the user
        # The client can detect the failed transaction and retry if needed

        return analysis_result

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error annotating game {game_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error annotating game: {str(e)}")
