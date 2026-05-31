"""API v1 root router — aggregates all sub-routers."""

from fastapi import APIRouter

from src.api.v1.auth import router as auth_router
from src.api.v1.persons import router as persons_router
from src.api.v1.users import router as users_router

v1_router = APIRouter(prefix="/api/v1")

v1_router.include_router(auth_router)
v1_router.include_router(users_router)
v1_router.include_router(persons_router)
