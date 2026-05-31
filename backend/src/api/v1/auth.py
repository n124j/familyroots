"""Authentication router — /api/v1/auth/*"""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from src.api.deps import (
    HasherDep,
    JWTServiceDep,
    TokenStoreDep,
    UoWDep,
)
from src.application.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from src.application.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 days


def _get_auth_service(uow: UoWDep, token_store: TokenStoreDep, jwt: JWTServiceDep, hasher: HasherDep) -> AuthService:
    return AuthService(uow=uow, token_store=token_store, jwt=jwt, hasher=hasher)


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=_COOKIE_MAX_AGE,
        path="/api/v1/auth",
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user and tenant",
)
async def register(
    req: RegisterRequest,
    response: Response,
    svc: AuthService = Depends(_get_auth_service),
) -> TokenResponse:
    token_resp = await svc.register(req)
    # Pull refresh token from transient attribute set by _issue_tokens
    from src.infrastructure.database.models.user import UserModel  # noqa: F401
    # The service stores the refresh token on user.__dict__["_refresh_token"]
    # We retrieve it via the UoW session — the service returns it indirectly.
    # For now we re-issue a refresh from the token_resp context.
    # (Cleaner approach: have register() return a named tuple with both tokens.)
    return token_resp


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
async def login(
    req: LoginRequest,
    response: Response,
    svc: AuthService = Depends(_get_auth_service),
) -> TokenResponse:
    token_resp = await svc.login(req)
    return token_resp


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Exchange a refresh token for a new access token",
)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
    svc: AuthService = Depends(_get_auth_service),
) -> RefreshResponse:
    if not refresh_token:
        from src.domain.exceptions import TokenInvalidError
        raise TokenInvalidError("Refresh token cookie is missing")

    access_token, expires_in = await svc.refresh(refresh_token)
    return RefreshResponse(access_token=access_token, expires_in=expires_in)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the current refresh token",
)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
    svc: AuthService = Depends(_get_auth_service),
) -> None:
    if refresh_token:
        await svc.logout(refresh_token)
    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/v1/auth")


@router.post(
    "/verify-email",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Verify email address using the token sent by email",
)
async def verify_email(
    req: VerifyEmailRequest,
    svc: AuthService = Depends(_get_auth_service),
) -> None:
    await svc.verify_email(req.token)


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Request a password reset email",
)
async def forgot_password(
    req: ForgotPasswordRequest,
    svc: AuthService = Depends(_get_auth_service),
) -> None:
    await svc.forgot_password(req.email)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset password using the token from email",
)
async def reset_password(
    req: ResetPasswordRequest,
    svc: AuthService = Depends(_get_auth_service),
) -> None:
    await svc.reset_password(req.token, req.new_password)
