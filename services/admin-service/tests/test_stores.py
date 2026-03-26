import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_store(director_client: AsyncClient):
    resp = await director_client.post("/api/v1/admin/stores", json={"name": "Новый магазин", "address": "ул. Ленина, 1"})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Новый магазин"


@pytest.mark.asyncio
async def test_create_store_duplicate(director_client: AsyncClient):
    await director_client.post("/api/v1/admin/stores", json={"name": "Дубль магазин"})
    resp = await director_client.post("/api/v1/admin/stores", json={"name": "Дубль магазин"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_list_stores(director_client: AsyncClient, test_store):
    resp = await director_client.get("/api/v1/admin/stores")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_store(director_client: AsyncClient, test_store):
    resp = await director_client.get(f"/api/v1/admin/stores/{test_store.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(test_store.id)


@pytest.mark.asyncio
async def test_update_store(director_client: AsyncClient, test_store):
    resp = await director_client.patch(f"/api/v1/admin/stores/{test_store.id}", json={"name": "Обновлённый магазин"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Обновлённый магазин"
