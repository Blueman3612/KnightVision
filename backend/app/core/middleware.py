from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp

class OptionsMiddleware(BaseHTTPMiddleware):
    """Middleware to handle OPTIONS requests for CORS preflight."""
    
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS":
            return Response(status_code=200)
        return await call_next(request) 