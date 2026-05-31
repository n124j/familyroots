"""OAuth 2.0 endpoints — Google and GitHub Authorization Code flow.

Flow:
  1. GET  /auth/oauth/{provider}           → redirect browser to provider
  2. GET  /auth/oauth/{provider}/callback  → exchange code, issue JWT, redirect to frontend
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from src.api.deps import UoWDep, JWTServiceDep, TokenStoreDep, HasherDep
from src.core.config import Settings, get_settings
from src.domain.users.entities import User, UserStatus
from src.infrastructure.security.oauth import get_oauth_client, OAuthUserInfo
from src.infrastructure.database.models.collaboration import OAuthConnectionModel

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])

SUPPORTED_PROVIDERS = {"google", "github"}


# ── Step 1: redirect to provider ──────────────────────────────────────────────

@router.get("/{provider}")
async def oauth_redirect(
    provider: str,
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
) -> RedirectResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(404, f"Unknown OAuth provider: {provider}")

    client = get_oauth_client(provider, settings)
    state = client.generate_state()

    # Store state in httpOnly cookie (short TTL — 10 min)
    resp = RedirectResponse(client.build_authorization_url(state), status_code=302)
    resp.set_cookie(
        key=f"oauth_state_{provider}",
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
    )
    return resp


# ── Step 2: callback from provider ────────────────────────────────────────────

@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str,
    state: str,
    request: Request,
    uow: UoWDep,
    jwt_service: JWTServiceDep,
    token_store: TokenStoreDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> RedirectResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(404, f"Unknown OAuth provider: {provider}")

    # Validate CSRF state
    cookie_state = request.cookies.get(f"oauth_state_{provider}")
    if not cookie_state or cookie_state != state:
        _redirect_error(settings, "oauth_state_mismatch")

    client = get_oauth_client(provider, settings)

    try:
        access_token = await client.exchange_code(code)
        user_info: OAuthUserInfo = await client.get_user_info(access_token)
    except Exception as exc:
        return _redirect_error(settings, "oauth_provider_error")

    async with uow:
        # 1. Find or create user
        existing_user = await uow.users.get_by_email(user_info.email)

        if existing_user:
            user = existing_user
        else:
            # Auto-provision — create new user from OAuth profile
            user = User(
                id=uuid.uuid4(),
                tenant_id=settings.default_tenant_id,  # configurable per deploy
                email=user_info.email,
                display_given_name=_first(user_info.display_name),
                display_surname=_last(user_info.display_name),
                hashed_password=None,       # OAuth users have no password
                status=UserStatus.ACTIVE,
                is_email_verified=user_info.email_verified,
                avatar_url=user_info.avatar_url,
            )
            await uow.users.add(user)

        # 2. Upsert OAuth connection record
        # (simplified — production would use a dedicated repo)
        existing_conn = await uow.session.execute(
            __import__("sqlalchemy", fromlist=["select"]).select(OAuthConnectionModel).where(
                OAuthConnectionModel.provider == provider,
                OAuthConnectionModel.provider_user_id == user_info.provider_user_id,
            )
        )
        conn_row = existing_conn.scalar_one_or_none()
        if conn_row:
            conn_row.last_used_at = datetime.now(timezone.utc)
            conn_row.avatar_url = user_info.avatar_url
        else:
            conn = OAuthConnectionModel(
                id=uuid.uuid4(),
                user_id=user.id,
                tenant_id=user.tenant_id,
                provider=provider,
                provider_user_id=user_info.provider_user_id,
                email=user_info.email,
                display_name=user_info.display_name,
                avatar_url=user_info.avatar_url,
            )
            uow.session.add(conn)

        # 3. Issue JWT pair
        jwt_access = jwt_service.create_access_token(
            user_id=str(user.id),
            tenant_id=str(user.tenant_id),
        )
        jwt_refresh = jwt_service.create_refresh_token(
            user_id=str(user.id),
            tenant_id=str(user.tenant_id),
        )
        jti = jwt_service.decode_refresh_token(jwt_refresh)["jti"]
        await token_store.store_refresh_token(
            jti=jti,
            user_id=str(user.id),
            tenant_id=str(user.tenant_id),
        )

    # 4. Redirect to frontend with access token in query param
    #    (frontend should immediately move it to memory and drop from URL)
    frontend_url = (
        f"{settings.frontend_base_url}/auth/callback"
        f"?access_token={jwt_access}"
        f"&provider={provider}"
    )
    response = RedirectResponse(frontend_url, status_code=302)
    # Set refresh token in httpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=jwt_refresh,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        max_age=60 * 60 * 24 * 30,  # 30 days
    )
    # Clear the state cookie
    response.delete_cookie(f"oauth_state_{provider}")
    return response


# ── Helpers ────────────────────────────────────────────────────────────────────

def _redirect_error(settings: "Settings", reason: str) -> RedirectResponse:
    return RedirectResponse(
        f"{settings.frontend_base_url}/login?error={reason}",
        status_code=302,
    )

def _first(name: str | None) -> str:
    if not name:
        return ""
    parts = name.strip().split()
    return parts[0] if parts else ""

def _last(name: str | None) -> str:
    if not name:
        return ""
    parts = name.strip().split()
    return " ".join(parts[1:]) if len(parts) > 1 else ""
