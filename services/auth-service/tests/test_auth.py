import pytest
from httpx import AsyncClient

from app.security import hash_password
from app.models import User


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "director@test.ru",
        "password": "password123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["role"] == "director"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "director@test.ru",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user(client: AsyncClient, db_session, test_org):
    user = User(
        organization_id=test_org.id,
        email="inactive@test.ru",
        password_hash=hash_password("password123"),
        role="manager",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()

    resp = await client.post("/api/v1/auth/login", json={
        "email": "inactive@test.ru",
        "password": "password123",
    })
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, test_user):
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "director@test.ru",
        "password": "password123",
    })
    refresh_token = login_resp.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_refresh_revoked_token(client: AsyncClient, test_user):
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "director@test.ru",
        "password": "password123",
    })
    refresh_token = login_resp.json()["refresh_token"]

    # Use once
    await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})

    # Use again — should fail
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, test_user):
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "director@test.ru",
        "password": "password123",
    })
    access_token = login_resp.json()["access_token"]

    resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_verify_valid_token(client: AsyncClient, test_user):
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "director@test.ru",
        "password": "password123",
    })
    access_token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


@pytest.mark.asyncio
async def test_verify_invalid_token(client: AsyncClient):
    resp = await client.get(
        "/api/v1/auth/verify",
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
