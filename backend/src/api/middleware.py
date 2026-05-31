"""Custom ASGI middleware stack.

Middleware execution order (outermost → innermost):
    GZip (FastAPI built-in)
    → CORS (FastAPI built-in)
    → RequestIDMiddleware      — attaches X-Request-ID to every request/response
    → LoggingMiddleware        — structured access log via structlog
    → TenantMiddleware         — validates JWT, sets tenant_id + user_id context
"""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

log = structlog.get_logger(__name__)

_REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Attach a unique request ID to each request.

    - Reads X-Request-ID from the incoming request if present.
    - Generates a UUID4 otherwise.
    - Echoes the ID back in the response header.
    - Binds the ID to the structlog context so all log lines carry it.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(_REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id

        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()

        response.headers[_REQUEST_ID_HEADER] = request_id
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Structured access log: method, path, status, duration."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        log.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
            client=request.client.host if request.client else None,
        )
        return response


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Decode the Bearer JWT (if present) and bind tenant_id + user_id to
    request.state so downstream dependencies can read them without
    re-parsing the token.

    Routes that require authentication use the `get_current_user`
    dependency in `api/deps.py`, which raises 401 if state is unset.
    Public routes (health, auth/register, auth/login) are unaffected.
    """

    _PUBLIC_PREFIXES = (
        "/health",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/docs",
        "/redoc",
        "/openapi.json",
    )

    def __init__(self, app: ASGIApp, jwt_secret: str, jwt_algorithm: str = "HS256") -> None:
        super().__init__(app)
        self._secret = jwt_secret
        self._algorithm = jwt_algorithm

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Mark state defaults
        request.state.user_id = None
        request.state.tenant_id = None

        path = request.url.path
        if not any(path.startswith(p) for p in self._PUBLIC_PREFIXES):
            token = self._extract_bearer(request)
            if token:
                try:
                    from jose import jwt as jose_jwt
                    payload = jose_jwt.decode(token, self._secret, algorithms=[self._algorithm])
                    request.state.user_id = payload.get("sub")
                    request.state.tenant_id = payload.get("tid")
                    structlog.contextvars.bind_contextvars(
                        user_id=request.state.user_id,
                        tenant_id=request.state.tenant_id,
                    )
                except Exception:
                    pass  # let auth dependency raise 401

        return await call_next(request)

    @staticmethod
    def _extract_bearer(request: Request) -> str | None:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
        return None
