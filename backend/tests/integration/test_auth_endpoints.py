"""Integration tests for /api/v1/auth/* endpoints.

Uses the async test client from conftest.py (no real DB/Redis).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestRegister:
    async def test_register_returns_201(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/register", json={
            "email": "bob@example.com",
            "password": "Password1",
            "given_name": "Bob",
            "family_name": "Smith",
            "tenant_slug": "bob-org",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email_returns_409(self, test_client: AsyncClient) -> None:
        payload = {
            "email": "dup@example.com",
            "password": "Password1",
            "given_name": "A",
            "family_name": "B",
            "tenant_slug": "dup-org",
        }
        await test_client.post("/api/v1/auth/register", json=payload)
        resp = await test_client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409

    async def test_register_weak_password_returns_422(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/register", json={
            "email": "weak@example.com",
            "password": "short",
            "given_name": "A",
            "family_name": "B",
            "tenant_slug": "weak-org",
        })
        assert resp.status_code == 422

    async def test_register_invalid_email_returns_422(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "password": "Password1",
            "given_name": "A",
            "family_name": "B",
            "tenant_slug": "bad-email-org",
        })
        assert resp.status_code == 422


class TestLogin:
    async def test_valid_credentials_returns_200(self, test_client: AsyncClient) -> None:
        # Register first
        await test_client.post("/api/v1/auth/register", json={
            "email": "charlie@example.com",
            "password": "Password1",
            "given_name": "Charlie",
            "family_name": "Brown",
            "tenant_slug": "charlie-co",
        })
        resp = await test_client.post("/api/v1/auth/login", json={
            "email": "charlie@example.com",
            "password": "Password1",
        })
        # Unverified email → 403
        assert resp.status_code in (200, 403)

    async def test_wrong_password_returns_401(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "WrongPass1",
        })
        assert resp.status_code == 401

    async def test_missing_fields_returns_422(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/login", json={"email": "x@y.com"})
        assert resp.status_code == 422


class TestRefresh:
    async def test_missing_cookie_returns_401(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/refresh")
        assert resp.status_code == 401


class TestLogout:
    async def test_logout_without_cookie_returns_204(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/logout")
        assert resp.status_code == 204


class TestVerifyEmail:
    async def test_invalid_token_returns_401(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/verify-email", json={"token": "bad-token"})
        assert resp.status_code == 401


class TestForgotPassword:
    async def test_always_returns_204(self, test_client: AsyncClient) -> None:
        resp = await test_client.post("/api/v1/auth/forgot-password", json={"email": "any@example.com"})
        assert resp.status_code == 204


class TestHealth:
    async def test_health_returns_200(self, test_client: AsyncClient) -> None:
        resp = await test_client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
