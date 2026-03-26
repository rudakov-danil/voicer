import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_seller(director_client: AsyncClient, test_store):
    resp = await director_client.post("/api/v1/admin/sellers", json={
        "store_id": str(test_store.id),
        "first_name": "Мария",
        "last_name": "Иванова",
    })
    assert resp.status_code == 201
    assert resp.json()["first_name"] == "Мария"


@pytest.mark.asyncio
async def test_list_sellers(director_client: AsyncClient, test_seller):
    resp = await director_client.get("/api/v1/admin/sellers")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_update_seller_soft_delete(director_client: AsyncClient, test_seller):
    resp = await director_client.patch(f"/api/v1/admin/sellers/{test_seller.id}", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_get_seller(director_client: AsyncClient, test_seller):
    resp = await director_client.get(f"/api/v1/admin/sellers/{test_seller.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(test_seller.id)
