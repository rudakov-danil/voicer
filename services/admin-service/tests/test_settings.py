import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_privacy_settings_defaults(director_client: AsyncClient):
    resp = await director_client.get("/api/v1/admin/settings/privacy")
    assert resp.status_code == 200
    assert resp.json()["retention_days"] == 90


@pytest.mark.asyncio
async def test_update_privacy_settings(director_client: AsyncClient):
    resp = await director_client.put("/api/v1/admin/settings/privacy", json={
        "retention_days": 180,
        "anonymize_transcripts": True,
        "consent_required": False,
    })
    assert resp.status_code == 200
    assert resp.json()["retention_days"] == 180

    # Verify persisted
    get_resp = await director_client.get("/api/v1/admin/settings/privacy")
    assert get_resp.json()["retention_days"] == 180


@pytest.mark.asyncio
async def test_update_alert_settings(director_client: AsyncClient):
    resp = await director_client.put("/api/v1/admin/settings/alerts", json={
        "score_threshold": 75,
        "no_activity_hours": 6,
        "email_recipients": ["admin@test.ru"],
        "is_active": True,
    })
    assert resp.status_code == 200
    assert resp.json()["score_threshold"] == 75
