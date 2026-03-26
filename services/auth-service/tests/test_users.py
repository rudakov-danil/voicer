import pytest
from httpx import AsyncClient


async def _get_token(client: AsyncClient, email: str = "director@test.ru", password: str = "password123") -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_create_user(client: AsyncClient, test_user, test_org):
    token = await _get_token(client)
    resp = await client.post(
        "/api/v1/auth/users",
        json={
            "email": "newmanager@test.ru",
            "password": "password123",
            "role": "manager",
            "store_id": "00000000-0000-0000-0000-000000000001",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "manager"


@pytest.mark.asyncio
async def test_create_user_duplicate_email(client: AsyncClient, test_user):
    token = await _get_token(client)
    await client.post(
        "/api/v1/auth/users",
        json={"email": "dup@test.ru", "password": "password123", "role": "rop"},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp = await client.post(
        "/api/v1/auth/users",
        json={"email": "dup@test.ru", "password": "password123", "role": "rop"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_manager_without_store(client: AsyncClient, test_user):
    token = await _get_token(client)
    resp = await client.post(
        "/api/v1/auth/users",
        json={"email": "mgr2@test.ru", "password": "password123", "role": "manager"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_users_forbidden_for_manager(client: AsyncClient, db_session, test_org):
    from app.models import User
    from app.security import hash_password

    mgr = User(
        organization_id=test_org.id,
        email="mgr_list@test.ru",
        password_hash=hash_password("password123"),
        role="manager",
    )
    db_session.add(mgr)
    await db_session.commit()

    resp = await client.post("/api/v1/auth/login", json={"email": "mgr_list@test.ru", "password": "password123"})
    token = resp.json()["access_token"]

    resp = await client.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
