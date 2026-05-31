"""Unit tests for AuthService.

All tests run without a real database or Redis — backed by in-memory fakes
defined in conftest.py.
"""

from __future__ import annotations

import pytest

from src.application.auth.schemas import LoginRequest, RegisterRequest
from src.application.auth.service import AuthService
from src.domain.exceptions import (
    AccountLockedError,
    AccountNotVerifiedError,
    AlreadyExistsError,
    InvalidCredentialsError,
    TokenInvalidError,
)
from src.infrastructure.database.models.user import UserModel
from tests.conftest import (
    TEST_TENANT_ID,
    TEST_USER_ID,
    FakeTokenStore,
    FakeUnitOfWork,
    FakeUserRepository,
)


pytestmark = pytest.mark.asyncio


# ── Login ─────────────────────────────────────────────────────────

class TestLogin:
    async def test_successful_login(self, auth_service: AuthService) -> None:
        req = LoginRequest(email="alice@example.com", password="Password1")
        resp = await auth_service.login(req)

        assert resp.access_token
        assert resp.user_id == TEST_USER_ID
        assert resp.tenant_id == TEST_TENANT_ID
        assert resp.expires_in == 900

    async def test_wrong_password_raises(self, auth_service: AuthService) -> None:
        req = LoginRequest(email="alice@example.com", password="wrongpassword")
        with pytest.raises(InvalidCredentialsError):
            await auth_service.login(req)

    async def test_failed_attempts_increment(
        self,
        auth_service: AuthService,
        fake_uow: FakeUnitOfWork,
    ) -> None:
        req = LoginRequest(email="alice@example.com", password="bad")
        with pytest.raises(InvalidCredentialsError):
            await auth_service.login(req)

        user = fake_uow.users._users[0]
        assert user.failed_login_attempts == 1

    async def test_account_locked_after_max_attempts(
        self,
        auth_service: AuthService,
        fake_uow: FakeUnitOfWork,
        verified_user: UserModel,
    ) -> None:
        from tests.conftest import _MAX_FAILED_ATTEMPTS  # noqa: F401
        verified_user.failed_login_attempts = 4  # one more will lock

        req = LoginRequest(email="alice@example.com", password="bad")
        with pytest.raises(InvalidCredentialsError):
            await auth_service.login(req)

        assert verified_user.locked_until is not None

    async def test_locked_account_raises(
        self,
        auth_service: AuthService,
        verified_user: UserModel,
    ) -> None:
        from datetime import timedelta, timezone
        from datetime import datetime
        verified_user.locked_until = datetime.now(tz=timezone.utc) + timedelta(minutes=10)

        req = LoginRequest(email="alice@example.com", password="Password1")
        with pytest.raises(AccountLockedError):
            await auth_service.login(req)

    async def test_unverified_email_raises(
        self,
        auth_service: AuthService,
        verified_user: UserModel,
    ) -> None:
        verified_user.email_verified = False

        req = LoginRequest(email="alice@example.com", password="Password1")
        with pytest.raises(AccountNotVerifiedError):
            await auth_service.login(req)

    async def test_nonexistent_user_raises(self, auth_service: AuthService) -> None:
        req = LoginRequest(email="ghost@example.com", password="Password1")
        with pytest.raises(InvalidCredentialsError):
            await auth_service.login(req)


# ── Refresh ───────────────────────────────────────────────────────

class TestRefresh:
    async def test_valid_refresh_issues_new_access_token(
        self,
        auth_service: AuthService,
        fake_token_store: FakeTokenStore,
        jwt_service,
    ) -> None:
        import uuid
        user_id = TEST_USER_ID
        tenant_id = TEST_TENANT_ID
        refresh_token, jti = jwt_service.create_refresh_token(user_id, tenant_id)
        await fake_token_store.store(jti, user_id, 3600)

        access_token, expires_in = await auth_service.refresh(refresh_token)

        assert access_token
        assert expires_in == 900

    async def test_revoked_refresh_raises(
        self,
        auth_service: AuthService,
        jwt_service,
    ) -> None:
        import uuid
        refresh_token, _ = jwt_service.create_refresh_token(TEST_USER_ID, TEST_TENANT_ID)
        # token not stored in redis → revoked / never issued

        with pytest.raises(TokenInvalidError):
            await auth_service.refresh(refresh_token)


# ── Logout ────────────────────────────────────────────────────────

class TestLogout:
    async def test_logout_revokes_token(
        self,
        auth_service: AuthService,
        fake_token_store: FakeTokenStore,
        jwt_service,
    ) -> None:
        refresh_token, jti = jwt_service.create_refresh_token(TEST_USER_ID, TEST_TENANT_ID)
        await fake_token_store.store(jti, TEST_USER_ID, 3600)

        await auth_service.logout(refresh_token)

        assert not await fake_token_store.exists(jti)

    async def test_logout_with_invalid_token_is_noop(self, auth_service: AuthService) -> None:
        # Should not raise
        await auth_service.logout("totally-invalid-token")


# ── Email verification ────────────────────────────────────────────

class TestEmailVerification:
    async def test_verify_marks_email_verified(
        self,
        auth_service: AuthService,
        fake_uow: FakeUnitOfWork,
        verified_user: UserModel,
    ) -> None:
        verified_user.email_verified = False
        verified_user.email_verification_token = "valid-token-abc"

        await auth_service.verify_email("valid-token-abc")

        assert verified_user.email_verified
        assert verified_user.email_verification_token is None

    async def test_invalid_token_raises(self, auth_service: AuthService) -> None:
        with pytest.raises(TokenInvalidError):
            await auth_service.verify_email("bad-token")


# ── Password reset ────────────────────────────────────────────────

class TestPasswordReset:
    async def test_reset_changes_password(
        self,
        auth_service: AuthService,
        fake_uow: FakeUnitOfWork,
        verified_user: UserModel,
        hasher,
    ) -> None:
        from datetime import timedelta, timezone, datetime
        verified_user.password_reset_token = "reset-token-xyz"
        verified_user.password_reset_expires_at = datetime.now(tz=timezone.utc) + timedelta(hours=1)

        await auth_service.reset_password("reset-token-xyz", "NewPassword1")

        assert hasher.verify("NewPassword1", verified_user.password_hash)
        assert verified_user.password_reset_token is None

    async def test_expired_token_raises(
        self,
        auth_service: AuthService,
        verified_user: UserModel,
    ) -> None:
        from datetime import timedelta, timezone, datetime
        verified_user.password_reset_token = "expired-token"
        verified_user.password_reset_expires_at = datetime.now(tz=timezone.utc) - timedelta(hours=1)

        from src.domain.exceptions import TokenExpiredError
        with pytest.raises(TokenExpiredError):
            await auth_service.reset_password("expired-token", "NewPassword1")
