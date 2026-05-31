"""Shared pytest fixtures.

Layers:
  - unit tests   — use mock UoW; no DB required
  - integration  — use real async test DB (postgres) + async test client
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.application.auth.service import AuthService
from src.domain.interfaces.repositories import (
    AbstractRefreshTokenRepository,
    AbstractUserRepository,
)
from src.domain.interfaces.unit_of_work import AbstractUnitOfWork
from src.infrastructure.database.models.user import UserModel
from src.infrastructure.security.jwt import JWTService
from src.infrastructure.security.password import PasswordHasher


# ── Constants ─────────────────────────────────────────────────────

TEST_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
TEST_SECRET = "test-secret-key-that-is-long-enough-for-hs256"


# ── Domain fakes ──────────────────────────────────────────────────

class FakeUserRepository(AbstractUserRepository):
    def __init__(self, users: list[UserModel] | None = None) -> None:
        self._users: list[UserModel] = users or []

    async def get_by_id(self, entity_id: uuid.UUID) -> UserModel | None:
        return next((u for u in self._users if u.id == entity_id), None)

    async def add(self, entity: UserModel) -> UserModel:
        if not entity.id:
            entity.id = uuid.uuid4()
        self._users.append(entity)
        return entity

    async def update(self, entity: UserModel) -> UserModel:
        return entity

    async def delete(self, entity_id: uuid.UUID) -> None:
        self._users = [u for u in self._users if u.id != entity_id]

    async def get_by_email(self, tenant_id: uuid.UUID, email: str) -> UserModel | None:
        return next(
            (u for u in self._users if u.tenant_id == tenant_id and u.email == email.lower()),
            None,
        )

    async def get_by_id_and_tenant(self, user_id: uuid.UUID, tenant_id: uuid.UUID) -> UserModel | None:
        return next(
            (u for u in self._users if u.id == user_id and u.tenant_id == tenant_id),
            None,
        )

    async def exists_by_email(self, tenant_id: uuid.UUID, email: str) -> bool:
        return any(u.tenant_id == tenant_id and u.email == email.lower() for u in self._users)

    async def get_by_password_reset_token(self, token: str) -> UserModel | None:
        return next((u for u in self._users if u.password_reset_token == token), None)

    async def get_by_verification_token(self, token: str) -> UserModel | None:
        return next((u for u in self._users if u.email_verification_token == token), None)


class FakeTenantRepository:
    def __init__(self) -> None:
        self._tenants: list[Any] = []

    async def get_by_id(self, entity_id: uuid.UUID) -> Any:
        return next((t for t in self._tenants if t.id == entity_id), None)

    async def add(self, entity: Any) -> Any:
        if not getattr(entity, "id", None):
            entity.id = uuid.uuid4()
        self._tenants.append(entity)
        return entity

    async def update(self, entity: Any) -> Any:
        return entity

    async def delete(self, entity_id: uuid.UUID) -> None:
        pass

    async def get_by_slug(self, slug: str) -> Any | None:
        return next((t for t in self._tenants if t.slug == slug), None)

    async def exists_by_slug(self, slug: str) -> bool:
        return any(t.slug == slug for t in self._tenants)


class FakeUnitOfWork(AbstractUnitOfWork):
    def __init__(self, users: FakeUserRepository | None = None) -> None:
        self._users = users or FakeUserRepository()
        self._tenants = FakeTenantRepository()
        self.committed = False

    @property
    def users(self) -> FakeUserRepository:
        return self._users

    @property
    def tenants(self) -> FakeTenantRepository:
        return self._tenants

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        pass

    # Expose internal session stub for AuthService._find_user_by_email
    class _FakeSession:
        def __init__(self, users: list[UserModel]) -> None:
            self._users = users

        async def execute(self, stmt: Any) -> Any:
            class _Result:
                def __init__(self, items: list) -> None:
                    self._items = items
                def scalars(self) -> "_Result":
                    return self
                def first(self) -> Any:
                    return self._items[0] if self._items else None
            return _Result(self._users)

    @property
    def _session(self) -> Any:
        return self._FakeSession(self._users._users)


class FakeTokenStore(AbstractRefreshTokenRepository):
    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def store(self, jti: str, user_id: uuid.UUID, expires_in_seconds: int) -> None:
        self._store[jti] = str(user_id)

    async def exists(self, jti: str) -> bool:
        return jti in self._store

    async def revoke(self, jti: str) -> None:
        self._store.pop(jti, None)

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        self._store = {k: v for k, v in self._store.items() if v != str(user_id)}


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def jwt_service() -> JWTService:
    return JWTService(secret_key=TEST_SECRET, access_token_expire_minutes=15, refresh_token_expire_days=30)


@pytest.fixture
def hasher() -> PasswordHasher:
    return PasswordHasher()


@pytest.fixture
def fake_token_store() -> FakeTokenStore:
    return FakeTokenStore()


@pytest.fixture
def verified_user(hasher: PasswordHasher) -> UserModel:
    user = UserModel()
    user.id = TEST_USER_ID
    user.tenant_id = TEST_TENANT_ID
    user.email = "alice@example.com"
    user.password_hash = hasher.hash("Password1")
    user.email_verified = True
    user.email_verified_at = datetime.now(tz=timezone.utc)
    user.is_active = True
    user.failed_login_attempts = 0
    user.locked_until = None
    return user


@pytest.fixture
def fake_uow(verified_user: UserModel) -> FakeUnitOfWork:
    repo = FakeUserRepository(users=[verified_user])
    return FakeUnitOfWork(users=repo)


@pytest.fixture
def auth_service(
    fake_uow: FakeUnitOfWork,
    fake_token_store: FakeTokenStore,
    jwt_service: JWTService,
    hasher: PasswordHasher,
) -> AuthService:
    return AuthService(uow=fake_uow, token_store=fake_token_store, jwt=jwt_service, hasher=hasher)


# ── Integration: async test client ────────────────────────────────

@pytest_asyncio.fixture
async def test_client() -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client against the FastAPI app with overridden dependencies.
    No real DB or Redis needed — uses fake implementations.
    """
    from src.main import create_app
    from src.api.deps import get_uow, get_token_store

    app = create_app()

    fake_uow = FakeUnitOfWork()
    fake_store = FakeTokenStore()

    app.dependency_overrides[get_uow] = lambda: fake_uow
    app.dependency_overrides[get_token_store] = lambda: fake_store

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
