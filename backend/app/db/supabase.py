from supabase import create_client, Client
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Security scheme for JWT authentication
security = HTTPBearer()

def get_supabase_client() -> Client:
    """
    Get a Supabase client instance.
    
    Returns:
        Client: Supabase client
    """
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to create Supabase client: {str(e)}")
        raise RuntimeError(f"Failed to create Supabase client: {str(e)}")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Get the current authenticated user from the JWT token.
    
    Args:
        credentials: HTTP Authorization credentials
        
    Returns:
        str: User ID
    """
    token = credentials.credentials
    supabase = get_supabase_client()
    
    try:
        # Verify the token and get user data
        response = supabase.auth.get_user(token)
        
        if response and response.user:
            return response.user.id
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) 