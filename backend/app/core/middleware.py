from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp

class OptionsMiddleware(BaseHTTPMiddleware):
    """Middleware to handle OPTIONS requests for CORS preflight."""
    
    async def dispatch(self, request, call_next):
        # Only handle OPTIONS requests for API endpoints and add proper CORS headers
        if request.method == "OPTIONS" and request.url.path.startswith("/games/"):
            return Response(
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": "https://www.knightvision.app",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Credentials": "true",
                }
            )
        return await call_next(request) 