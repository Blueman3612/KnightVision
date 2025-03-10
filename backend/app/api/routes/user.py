from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Dict, List, Optional
import logging

from app.db.supabase import get_supabase_client, get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

class UserProfile(BaseModel):
    """User profile model."""
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    elo_rating: Optional[int] = 1200
    games_played: Optional[int] = 0
    created_at: Optional[str] = None

class UserProfileUpdate(BaseModel):
    """User profile update model."""
    full_name: Optional[str] = None
    elo_rating: Optional[int] = None

@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(user_id: str = Depends(get_current_user)):
    """
    Get the current user's profile.
    
    Args:
        user_id: Current user ID from token
        
    Returns:
        UserProfile: User profile data
    """
    supabase = get_supabase_client()
    
    try:
        response = supabase.table("users").select("*").eq("id", user_id).execute()
        
        if response.data and len(response.data) > 0:
            return UserProfile(**response.data[0])
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
    except Exception as e:
        logger.error(f"Error fetching user profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user profile"
        )

@router.patch("/me", response_model=UserProfile)
async def update_current_user_profile(
    profile_update: UserProfileUpdate,
    user_id: str = Depends(get_current_user)
):
    """
    Update the current user's profile.
    
    Args:
        profile_update: Profile data to update
        user_id: Current user ID from token
        
    Returns:
        UserProfile: Updated user profile
    """
    supabase = get_supabase_client()
    
    try:
        # Filter out None values
        update_data = {k: v for k, v in profile_update.dict().items() if v is not None}
        
        if not update_data:
            # No fields to update
            return await get_current_user_profile(user_id)
        
        # Update user profile
        response = supabase.table("users").update(update_data).eq("id", user_id).execute()
        
        if response.data and len(response.data) > 0:
            return UserProfile(**response.data[0])
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
    except Exception as e:
        logger.error(f"Error updating user profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user profile"
        ) 