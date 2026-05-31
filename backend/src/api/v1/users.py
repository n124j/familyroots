"""Users router — /api/v1/users/*"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from src.api.deps import (
    HasherDep,
    TokenStoreDep,
    UoWDep,
    VerifiedUserDep,
)
from src.application.users.schemas import UpdateUserRequest, UserProfileResponse
from src.application.users.service import UserService
from src.application.auth.schemas import ChangePasswordRequest

router = APIRouter(prefix="/users", tags=["Users"])


def _get_user_service(uow: UoWDep, token_store: TokenStoreDep, hasher: HasherDep) -> UserService:
    return UserService(uow=uow, token_store=token_store, hasher=hasher)


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get the authenticated user's profile",
)
async def get_me(
    user: VerifiedUserDep,
    uow: UoWDep,
    token_store: TokenStoreDep,
    hasher: HasherDep,
) -> UserProfileResponse:
    svc = UserService(uow=uow, token_store=token_store, hasher=hasher)
    return await svc.get_me(user.id, user.tenant_id)


@router.patch(
    "/me",
    response_model=UserProfileResponse,
    summary="Update the authenticated user's profile",
)
async def update_me(
    req: UpdateUserRequest,
    user: VerifiedUserDep,
    uow: UoWDep,
    token_store: TokenStoreDep,
    hasher: HasherDep,
) -> UserProfileResponse:
    svc = UserService(uow=uow, token_store=token_store, hasher=hasher)
    return await svc.update_me(user.id, user.tenant_id, req)


@router.post(
    "/me/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the authenticated user's password",
)
async def change_password(
    req: ChangePasswordRequest,
    user: VerifiedUserDep,
    uow: UoWDep,
    token_store: TokenStoreDep,
    hasher: HasherDep,
) -> None:
    svc = UserService(uow=uow, token_store=token_store, hasher=hasher)
    await svc.change_password(user.id, user.tenant_id, req.current_password, req.new_password)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete the authenticated user's account",
)
async def delete_account(
    password: str,  # passed as query param for simplicity; use request body in production
    user: VerifiedUserDep,
    uow: UoWDep,
    token_store: TokenStoreDep,
    hasher: HasherDep,
) -> None:
    svc = UserService(uow=uow, token_store=token_store, hasher=hasher)
    await svc.delete_account(user.id, user.tenant_id, password)
