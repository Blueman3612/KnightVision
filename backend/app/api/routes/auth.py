from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Dict, Optional
import logging

from app.db.supabase import get_supabase_client

router = APIRouter()
logger = logging.getLogger(__name__)

class UserRegisterRequest(BaseModel):
    """User registration request model."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    display_name: Optional[str] = None

class UserLoginRequest(BaseModel):
    """User login request model."""
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    """Authentication response model."""
    access_token: str
    token_type: str
    user_id: str
    email: str

@router.post("/register", response_model=AuthResponse)
async def register(user_data: UserRegisterRequest):
    """
    Register a new user.
    
    Args:
        user_data: User registration data
        
    Returns:
        AuthResponse: Authentication response with token
    """
    supabase = get_supabase_client()
    
    try:
        # Register user with Supabase
        response = supabase.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
        })
        
        # Create user profile in the database
        if response.user:
            user_profile = {
                "id": response.user.id,
                "email": user_data.email,
                "display_name": user_data.display_name,
            }
            
            supabase.table("users").insert(user_profile).execute()
            
            return AuthResponse(
                access_token=response.session.access_token,
                token_type="bearer",
                user_id=response.user.id,
                email=user_data.email
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User registration failed"
            )
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: {str(e)}"
        )

@router.post("/login", response_model=AuthResponse)
async def login(credentials: UserLoginRequest):
    """
    Login a user.
    
    Args:
        credentials: User login credentials
        
    Returns:
        AuthResponse: Authentication response with token
    """
    supabase = get_supabase_client()
    
    try:
        # Login user with Supabase
        response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password,
        })
        
        if response.user:
            return AuthResponse(
                access_token=response.session.access_token,
                token_type="bearer",
                user_id=response.user.id,
                email=credentials.email
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

@router.post("/logout")
async def logout(token: str = Depends(lambda x: x)):
    """
    Logout a user.
    
    Args:
        token: JWT token from authorization header
        
    Returns:
        Dict: Success message
    """
    supabase = get_supabase_client()
    
    try:
        supabase.auth.sign_out()
        return {"message": "Successfully logged out"}
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        ) 