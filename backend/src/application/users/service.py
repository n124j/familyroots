"""UserService — profile retrieval and mutation for the authenticated user."""

from __future__ import annotations

import uuid

import structlog

from src.application.users.schemas import UpdateUserRequest, UserProfileResponse
from src.domain.exceptions import InvalidCredentialsError, NotFoundError
from src.domain.interfaces.repositories import AbstractRefreshTokenRepository
from src.domain.interfaces.unit_of_work import AbstractUnitOfWork
from src.infrastructure.security.password import PasswordHasher

log = structlog.get_logger(__name__)


class UserService:
    def __init__(
        self,
        uow: AbstractUnitOfWork,
        token_store: AbstractRefreshTokenRepository,
        hasher: PasswordHasher,
    ) -> None:
        self._uow = uow
        self._tokens = token_store
        self._hasher = hasher

    async def get_me(self, user_id: uuid.UUID, tenant_id: uuid.UUID) -> UserProfileResponse:
        async with self._uow:
            user = await self._uow.users.get_by_id_and_tenant(user_id, tenant_id)
            if user is None:
                raise NotFoundError(resource="user", identifier=str(user_id))
            return UserProfileResponse.model_validate(user)

    async def update_me(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        req: UpdateUserRequest,
    ) -> UserProfileResponse:
        async with self._uow:
            user = await self._uow.users.get_by_id_and_tenant(user_id, tenant_id)
            if user is None:
                raise NotFoundError(resource="user", identifier=str(user_id))

            update_data = req.model_dump(exclude_none=True)
            for field, value in update_data.items():
                setattr(user, field, value)

            user = await self._uow.users.update(user)
            log.info("user.updated", user_id=str(user_id))
            return UserProfileResponse.model_validate(user)

    async def change_password(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        current_password: str,
        new_password: str,
    ) -> None:
        async with self._uow:
            user = await self._uow.users.get_by_id_and_tenant(user_id, tenant_id)
            if user is None:
                raise NotFoundError(resource="user", identifier=str(user_id))

            if not user.password_hash or not self._hasher.verify(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")

            user.password_hash = self._hasher.hash(new_password)
            await self._uow.users.update(user)

        # Revoke all sessions — forces re-login on other devices
        await self._tokens.revoke_all_for_user(user_id)
        log.info("user.password_changed", user_id=str(user_id))

    async def delete_account(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        password: str,
    ) -> None:
        async with self._uow:
            user = await self._uow.users.get_by_id_and_tenant(user_id, tenant_id)
            if user is None:
                raise NotFoundError(resource="user", identifier=str(user_id))

            if not user.password_hash or not self._hasher.verify(password, user.password_hash):
                raise InvalidCredentialsError("Password is incorrect")

            # Soft-delete: mark inactive rather than hard DELETE
            user.is_active = False
            await self._uow.users.update(user)

        await self._tokens.revoke_all_for_user(user_id)
        log.info("user.deleted", user_id=str(user_id))
