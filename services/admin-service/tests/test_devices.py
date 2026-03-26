import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_device(director_client: AsyncClient, test_store):
    resp = await director_client.post("/api/v1/admin/devices", json={
        "store_id": str(test_store.id),
        "serial_number": "VIQ-TEST-001",
        "model": "VoiceBadge Pro v1",
    })
    assert resp.status_code == 201
    assert resp.json()["serial_number"] == "VIQ-TEST-001"


@pytest.mark.asyncio
async def test_create_device_duplicate_serial(director_client: AsyncClient, test_store):
    await director_client.post("/api/v1/admin/devices", json={
        "store_id": str(test_store.id), "serial_number": "VIQ-DUP-001",
    })
    resp = await director_client.post("/api/v1/admin/devices", json={
        "store_id": str(test_store.id), "serial_number": "VIQ-DUP-001",
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_get_device_by_serial(client: AsyncClient, test_store, db_session):
    from app.models import Device
    device = Device(
        organization_id="00000000-0000-0000-0000-000000000010",
        store_id=test_store.id,
        serial_number="VIQ-SERIAL-TEST",
        is_active=True,
    )
    db_session.add(device)
    await db_session.commit()

    resp = await client.get("/api/v1/admin/devices/by-serial/VIQ-SERIAL-TEST")
    assert resp.status_code == 200
    assert resp.json()["serial_number"] == "VIQ-SERIAL-TEST"


@pytest.mark.asyncio
async def test_get_device_by_serial_not_found(client: AsyncClient):
    resp = await client.get("/api/v1/admin/devices/by-serial/NONEXISTENT")
    assert resp.status_code == 404
