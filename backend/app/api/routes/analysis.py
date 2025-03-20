from fastapi import APIRouter, Depends, HTTPException, Body, Query
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Union
import chess
import io
import logging

from app.services.analysis import analysis_service
from app.models.analysis import PositionAnalysis, GameAnalysisResult, MoveAnalysis
from app.db.supabase import get_supabase_client, get_current_user

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

class PositionAnalysisRequest(BaseModel):
    """Request model for position analysis."""
    fen: str = Field(..., description="FEN notation of the position to evaluate")
    depth: Optional[int] = Field(None, description="Search depth")

class GameAnalysisRequest(BaseModel):
    """Request model for game analysis."""
    pgn: str = Field(..., description="PGN notation of the game")
    depth: Optional[int] = Field(None, description="Search depth")

@router.post("/position", response_model=PositionAnalysis)
async def analyze_position(request: PositionAnalysisRequest):
    """
    Analyze a chess position with enhanced metrics including square control and tactical motifs.
    
    Args:
        request: Position analysis request with FEN and options
        
    Returns:
        PositionAnalysis: Detailed position analysis
    """
    try:
        result = await analysis_service.analyze_position(
            request.fen,
            request.depth
        )
        
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN format")
    except Exception as e:
        logger.error(f"Error analyzing position: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis engine error: {str(e)}")

@router.post("/game", response_model=GameAnalysisResult)
async def analyze_game(request: GameAnalysisRequest):
    """
    Analyze a chess game with enhanced tactical and positional insights.
    
    Args:
        request: Game analysis request with PGN and options
        
    Returns:
        GameAnalysisResult: Complete game analysis
    """
    try:
        result = await analysis_service.analyze_game(
            request.pgn,
            request.depth
        )
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error analyzing game: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis engine error: {str(e)}")

@router.get("/game/{game_id}", response_model=GameAnalysisResult)
async def analyze_game_by_id(
    game_id: str,
    depth: Optional[int] = Query(None),
    user_id: str = Depends(get_current_user)
):
    """
    Analyze a chess game by retrieving its PGN from the database.
    This endpoint avoids JSON escaping issues by getting the PGN directly from the database.
    
    Args:
        game_id: ID of the game to analyze
        depth: Search depth (optional)
        user_id: Current authenticated user
        
    Returns:
        GameAnalysisResult: Complete game analysis
    """
    # Validate user authentication
    if not user_id:
        raise HTTPException(
            status_code=401, 
            detail="Authentication required to analyze games"
        )
    
    supabase = get_supabase_client()
    
    try:
        # Get the game from the database
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()
        
        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, 
                detail=f"Game with ID {game_id} not found"
            )
            
        game = game_response.data[0]
        
        # Check if game belongs to the user
        if game.get("user_id") != user_id:
            raise HTTPException(
                status_code=403, 
                detail="You don't have permission to analyze this game"
            )
            
        # Get the PGN from the game
        pgn = game.get("pgn") or game.get("moves_only", "")
        if not pgn:
            raise HTTPException(
                status_code=400, 
                detail="Game does not contain valid PGN data required for analysis"
            )
        
        # Analyze the game
        result = await analysis_service.analyze_game(
            pgn,
            depth,
            game_id
        )
        
        return result
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error analyzing game {game_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis engine error: {str(e)}")

@router.post("/{game_id}/enhanced-annotate", response_model=GameAnalysisResult)
async def enhanced_annotate_game(
    game_id: str,
    user_id: str = Depends(get_current_user)
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
            status_code=401, 
            detail="Authentication required to annotate games"
        )
    
    supabase = get_supabase_client()
    
    try:
        # Get the game from the database
        game_response = supabase.table("games").select("*").eq("id", game_id).execute()
        
        if len(game_response.data) == 0:
            raise HTTPException(
                status_code=404, 
                detail=f"Game with ID {game_id} not found"
            )
            
        game = game_response.data[0]
        
        # Check if game belongs to the user
        if game.get("user_id") != user_id:
            raise HTTPException(
                status_code=403, 
                detail="You don't have permission to annotate this game"
            )
            
        # Check if the game is already enhanced analyzed
        if game.get("enhanced_analyzed", False):
            # If already annotated, just return the existing annotations
            try:
                # Retrieve the enhanced annotations
                annotations_response = supabase.table("enhanced_move_annotations").select("*").eq("game_id", game_id).order("id").execute()
                
                if len(annotations_response.data) > 0:
                    # Convert to MoveAnalysis objects
                    annotations = []
                    
                    for annotation_data in annotations_response.data:
                        # Get tactical motifs
                        tactical_motifs_response = supabase.table("tactical_motifs").select("*").eq("annotation_id", annotation_data["id"]).execute()
                        
                        # Build the move analysis
                        move_analysis = MoveAnalysis(
                            move_uci=annotation_data["move_uci"],
                            move_san=annotation_data["move_san"],
                            move_number=annotation_data.get("move_number", 0),  # Default to 0 for backwards compatibility
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
                            square_control_before=annotation_data["square_control_before"],
                            square_control_after=annotation_data["square_control_after"],
                            move_improvement=annotation_data.get("move_improvement")
                        )
                        
                        annotations.append(move_analysis)
                    
                    # Get player weakness report
                    weakness_response = supabase.table("player_weakness_reports").select("*").eq("game_id", game_id).execute()
                    
                    player_weaknesses = {
                        "tactical": [], 
                        "positional": [], 
                        "opening": [], 
                        "endgame": []
                    }
                    critical_positions = []
                    
                    if len(weakness_response.data) > 0:
                        weakness_data = weakness_response.data[0]
                        player_weaknesses = {
                            "tactical": weakness_data.get("tactical_weakness", []),
                            "positional": weakness_data.get("positional_weakness", []),
                            "opening": weakness_data.get("opening_weakness", []),
                            "endgame": weakness_data.get("endgame_weakness", [])
                        }
                        critical_positions = weakness_data.get("critical_positions", [])
                    
                    return GameAnalysisResult(
                        game_id=game_id,
                        total_moves=len(annotations),
                        annotations=annotations,
                        player_weaknesses=player_weaknesses,
                        critical_positions=critical_positions
                    )
            except Exception as e:
                logger.warning(f"Failed to retrieve existing enhanced annotations for game {game_id}: {e}")
                # If there's an error retrieving annotations, proceed with re-analyzing
                
        # Parse the PGN
        pgn = game.get("pgn") or game.get("moves_only", "")
        if not pgn:
            raise HTTPException(
                status_code=400, 
                detail="Game does not contain valid PGN data required for annotation"
            )
        
        # Perform the enhanced analysis
        analysis_result = await analysis_service.analyze_game(
            pgn=pgn,
            game_id=game_id
        )
        
        # Store enhanced annotations in the database
        try:
            # Clear any existing data for this game to avoid duplicates
            supabase.table("enhanced_move_annotations").delete().eq("game_id", game_id).execute()
            supabase.table("player_weakness_reports").delete().eq("game_id", game_id).execute()
            
            # Store each move annotation
            for annotation in analysis_result.annotations:
                # Generate move improvement suggestions if not provided
                if not annotation.move_improvement and annotation.classification in ["mistake", "blunder"]:
                    if annotation.is_best_move:
                        move_improvement = "This was the best move despite the evaluation change."
                    else:
                        move_improvement = "Consider a different move."
                else:
                    move_improvement = annotation.move_improvement or ""
                
                # Convert annotation to dictionary for storage
                annotation_dict = {
                    "game_id": game_id,
                    "move_uci": annotation.move_uci,
                    "move_san": annotation.move_san,
                    "move_number": annotation.move_number,
                    "fen_before": annotation.fen_before,
                    "fen_after": annotation.fen_after,
                    "evaluation_before": annotation.evaluation_before,
                    "evaluation_after": annotation.evaluation_after,
                    "evaluation_change": annotation.evaluation_change,
                    "classification": annotation.classification,
                    "is_best_move": annotation.is_best_move,
                    "is_book_move": annotation.is_book_move,
                    "move_improvement": move_improvement,
                    # Convert square control to JSON
                    "square_control_before": {
                        "white_control": annotation.square_control_before.white_control,
                        "black_control": annotation.square_control_before.black_control,
                        "white_control_material": annotation.square_control_before.white_control_material,
                        "black_control_material": annotation.square_control_before.black_control_material,
                        "white_legal_moves": annotation.square_control_before.white_legal_moves,
                        "black_legal_moves": annotation.square_control_before.black_legal_moves
                    },
                    "square_control_after": {
                        "white_control": annotation.square_control_after.white_control,
                        "black_control": annotation.square_control_after.black_control,
                        "white_control_material": annotation.square_control_after.white_control_material,
                        "black_control_material": annotation.square_control_after.black_control_material,
                        "white_legal_moves": annotation.square_control_after.white_legal_moves,
                        "black_legal_moves": annotation.square_control_after.black_legal_moves
                    }
                }
                
                # Insert annotation
                annotation_response = supabase.table("enhanced_move_annotations").insert(annotation_dict).execute()
                
                # Get inserted annotation ID
                if len(annotation_response.data) > 0:
                    annotation_id = annotation_response.data[0]["id"]
                    
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
                                    "description": motif.description
                                }
                                
                                # Log before insertion for debugging
                                logger.info(f"Inserting tactical motif: {motif.motif_type}")
                                supabase.table("tactical_motifs").insert(motif_dict).execute()
                                logger.info(f"Successfully inserted tactical motif")
                            except Exception as motif_err:
                                logger.error(f"Failed to insert tactical motif: {motif_err}")
                    else:
                        logger.info(f"No tactical motifs for move {annotation.move_san}")
            
            # Ensure all fields have values
            tactical_weakness = analysis_result.player_weaknesses.get("tactical", [])
            positional_weakness = analysis_result.player_weaknesses.get("positional", [])
            opening_weakness = analysis_result.player_weaknesses.get("opening", [])
            endgame_weakness = analysis_result.player_weaknesses.get("endgame", [])
            
            # Log weakness data for debugging
            logger.info(f"Tactical weaknesses: {tactical_weakness}")
            logger.info(f"Opening weaknesses: {opening_weakness}")
            logger.info(f"Endgame weaknesses: {endgame_weakness}")
            
            # Store player weakness report with default empty arrays for any missing data
            weakness_dict = {
                "user_id": user_id,
                "game_id": game_id,
                "tactical_weakness": tactical_weakness if tactical_weakness else [],
                "positional_weakness": positional_weakness if positional_weakness else [],
                "opening_weakness": opening_weakness if opening_weakness else [],
                "endgame_weakness": endgame_weakness if endgame_weakness else [],
                "critical_positions": analysis_result.critical_positions if analysis_result.critical_positions else []
            }
            
            try:
                weakness_response = supabase.table("player_weakness_reports").insert(weakness_dict).execute()
                logger.info(f"Player weakness report stored: {weakness_response.data}")
            except Exception as w_err:
                logger.error(f"Failed to store player weakness report: {w_err}")
                
            # Update the game as enhanced analyzed
            supabase.table("games").update({"enhanced_analyzed": True}).eq("id", game_id).execute()
                
        except Exception as e:
            logger.error(f"Database error while storing enhanced annotations: {str(e)}")
            # Even if storage fails, we still return the analysis result to the user
            
        return analysis_result
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error annotating game {game_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error annotating game: {str(e)}"
        )