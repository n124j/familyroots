"""AuthService — register, login, refresh, logout, verify email, password reset.

Design:
- Depends on AbstractUnitOfWork (DB), AbstractRefreshTokenRepository (Redis),
  JWTService, and PasswordHasher.
- Raises domain exceptions only; HTTP mapping is in the API layer.
- Never imports FastAPI or HTTPException.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import structlog

from src.application.auth.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from src.domain.exceptions import (
    AccountLockedError,
    AccountNotVerifiedError,
    AlreadyExistsError,
    InvalidCredentialsError,
    NotFoundError,
    TokenExpiredError,
    TokenInvalidError,
)
from src.domain.interfaces.repositories import AbstractRefreshTokenRepository
from src.domain.interfaces.unit_of_work import AbstractUnitOfWork
from src.infrastructure.database.models.tenant import TenantModel
from src.infrastructure.database.models.user import UserModel
from src.infrastructure.security.jwt import JWTService
from src.infrastructure.security.password import PasswordHasher

log = structlog.get_logger(__name__)

# Lock account for 15 minutes after 5 failed attempts
_MAX_FAILED_ATTEMPTS = 5
_LOCK_DURATION = timedelta(minutes=15)
# Password reset / email verification tokens expire in 1 hour
_TOKEN_EXPIRE = timedelta(hours=1)


class AuthService:
    def __init__(
        self,
        uow: AbstractUnitOfWork,
        token_store: AbstractRefreshTokenRepository,
        jwt: JWTService,
        hasher: PasswordHasher,
    ) -> None:
        self._uow = uow
        self._tokens = token_store
        self._jwt = jwt
        self._hasher = hasher

    # ── Register ──────────────────────────────────────────────────

    async def register(self, req: RegisterRequest) -> TokenResponse:
        async with self._uow:
            # 1. Create or fetch tenant
            tenant = await self._uow.tenants.get_by_slug(req.tenant_slug)
            if tenant is None:
                tenant = TenantModel(
                    name=req.tenant_slug.replace("-", " ").title(),
                    slug=req.tenant_slug,
                    is_active=True,
                )
                tenant = await self._uow.tenants.add(tenant)

            # 2. Check email uniqueness within tenant
            if await self._uow.users.exists_by_email(tenant.id, req.email):
                raise AlreadyExistsError(
                    resource="user", field="email", value=req.email
                )

            # 3. Create user
            verification_token = secrets.token_hex(32)
            user = UserModel(
                tenant_id=tenant.id,
                email=req.email.lower(),
                password_hash=self._hasher.hash(req.password),
                given_name=req.given_name,
                family_name=req.family_name,
                email_verification_token=verification_token,
            )
            user = await self._uow.users.add(user)

        log.info("user.registered", user_id=str(user.id), tenant_id=str(tenant.id))

        # TODO: emit UserRegisteredEvent → send verification email via Celery
        return await self._issue_tokens(user)

    # ── Login ─────────────────────────────────────────────────────

    async def login(self, req: LoginRequest) -> TokenResponse:
        async with self._uow:
            # 1. Find tenant implicitly via email (single-tenant mode for now;
            #    multi-tenant login requires tenant slug in request)
            user = await self._find_user_by_email(req.email)

            # 2. Check account lock
            if user.is_locked:
                assert user.locked_until is not None
                retry_in = int((user.locked_until - datetime.now(tz=timezone.utc)).total_seconds())
                raise AccountLockedError(
                    "Account temporarily locked due to too many failed attempts",
                    retry_after_seconds=retry_in,
                )

            # 3. Verify password
            if not user.password_hash or not self._hasher.verify(req.password, user.password_hash):
                user.failed_login_attempts += 1
                if user.failed_login_attempts >= _MAX_FAILED_ATTEMPTS:
                    user.locked_until = datetime.now(tz=timezone.utc) + _LOCK_DURATION
                await self._uow.users.update(user)
                raise InvalidCredentialsError("Invalid email or password")

            # 4. Check email verification
            if not user.email_verified:
                raise AccountNotVerifiedError("Please verify your email before logging in")

            # 5. Reset failure counter, update last login
            user.failed_login_attempts = 0
            user.locked_until = None
            user.last_login_at = datetime.now(tz=timezone.utc)
            await self._uow.users.update(user)

        log.info("user.login", user_id=str(user.id))
        return await self._issue_tokens(user, remember_me=req.remember_me)

    # ── Refresh ───────────────────────────────────────────────────

    async def refresh(self, refresh_token: str) -> tuple[str, int]:
        """
        Validate refresh token and issue a new access token.
        Returns (new_access_token, expires_in_seconds).
        """
        payload = self._jwt.decode_refresh_token(refresh_token)
        jti = self._jwt.extract_jti(payload)

        if not await self._tokens.exists(jti):
            raise TokenInvalidError("Refresh token has been revoked")

        user_id = self._jwt.extract_user_id(payload)
        tenant_id = self._jwt.extract_tenant_id(payload)

        access_token, _ = self._jwt.create_access_token(user_id, tenant_id)
        expires_in = self._jwt.jwt_access_token_expire_minutes * 60  # type: ignore[attr-defined]
        return access_token, 900  # 15 min in seconds

    # ── Logout ────────────────────────────────────────────────────

    async def logout(self, refresh_token: str) -> None:
        try:
            payload = self._jwt.decode_refresh_token(refresh_token)
            jti = self._jwt.extract_jti(payload)
            await self._tokens.revoke(jti)
        except (TokenExpiredError, TokenInvalidError):
            # Token already invalid — logout is idempotent
            pass

    async def logout_all(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh tokens for a user (logout from all devices)."""
        await self._tokens.revoke_all_for_user(user_id)

    # ── Email verification ────────────────────────────────────────

    async def verify_email(self, token: str) -> None:
        async with self._uow:
            user = await self._uow.users.get_by_verification_token(token)
            if user is None:
                raise TokenInvalidError("Invalid or expired verification token")

            user.email_verified = True
            user.email_verified_at = datetime.now(tz=timezone.utc)
            user.email_verification_token = None
            await self._uow.users.update(user)

        log.info("user.email_verified", user_id=str(user.id))

    # ── Password reset ────────────────────────────────────────────

    async def forgot_password(self, email: str) -> None:
        """
        Generate a reset token. Always returns 204 to avoid email enumeration.
        Caller should emit an email via Celery.
        """
        async with self._uow:
            user = await self._find_user_by_email(email, raise_if_missing=False)
            if user is None:
                return  # silent no-op

            user.password_reset_token = secrets.token_hex(32)
            user.password_reset_expires_at = datetime.now(tz=timezone.utc) + _TOKEN_EXPIRE
            await self._uow.users.update(user)

        # TODO: emit PasswordResetRequestedEvent → Celery sends email

    async def reset_password(self, token: str, new_password: str) -> None:
        async with self._uow:
            user = await self._uow.users.get_by_password_reset_token(token)
            if user is None or user.password_reset_expires_at is None:
                raise TokenInvalidError("Invalid or expired reset token")

            if user.password_reset_expires_at < datetime.now(tz=timezone.utc):
                raise TokenExpiredError("Password reset token has expired")

            user.password_hash = self._hasher.hash(new_password)
            user.password_reset_token = None
            user.password_reset_expires_at = None
            user.failed_login_attempts = 0
            user.locked_until = None
            await self._uow.users.update(user)

        # Revoke all refresh tokens so attacker can't reuse old sessions
        await self._tokens.revoke_all_for_user(user.id)
        log.info("user.password_reset", user_id=str(user.id))

    # ── Helpers ───────────────────────────────────────────────────

    async def _find_user_by_email(
        self,
        email: str,
        raise_if_missing: bool = True,
    ) -> UserModel | None:
        """
        Single-tenant helper. For multi-tenant, the tenant slug must be
        supplied and the UoW scoped accordingly.
        """
        # In a real multi-tenant flow the tenant_id would come from the request.
        # For now we search without tenant scoping (works when RLS sets the context).
        # This will be revisited when the tree/tenant selection UI is built.
        from sqlalchemy import select
        from src.infrastructure.database.models.user import UserModel as _U

        # Access raw session via UoW's internal session (infrastructure concern)
        session = self._uow._session  # type: ignore[attr-defined]
        result = await session.execute(
            select(_U).where(_U.email == email.lower()).limit(1)
        )
        user = result.scalars().first()

        if user is None and raise_if_missing:
            raise InvalidCredentialsError("Invalid email or password")
        return user

    async def _issue_tokens(
        self,
        user: UserModel,
        remember_me: bool = False,
    ) -> TokenResponse:
        access_token, _ = self._jwt.create_access_token(user.id, user.tenant_id)
        refresh_token_str, refresh_jti = self._jwt.create_refresh_token(user.id, user.tenant_id)

        expire_seconds = self._jwt.refresh_expire_seconds
        await self._tokens.store(refresh_jti, user.id, expire_seconds)

        # The refresh token string is returned to the caller so the API layer
        # can set it as an HttpOnly cookie. We do NOT embed it in the response body.
        # Store on a transient attribute so the API layer can read it.
        user.__dict__["_refresh_token"] = refresh_token_str  # type: ignore[index]

        return TokenResponse(
            access_token=access_token,
            expires_in=900,  # 15 min
            user_id=user.id,
            tenant_id=user.tenant_id,
        )
