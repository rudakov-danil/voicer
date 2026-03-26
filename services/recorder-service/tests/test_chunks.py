import io
import wave
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient

from app.device_auth import DeviceRecord
from uuid import UUID


def make_wav_bytes(duration_ms: int = 500) -> bytes:
    num_samples = int(16000 * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


DEVICE_ID = "aaaaaaaa-0000-0000-0000-000000000001"
MOCK_DEVICE_RECORD = DeviceRecord(
    id=UUID("aaaaaaaa-0000-0000-0000-000000000001"),
    organization_id=UUID("bbbbbbbb-0000-0000-0000-000000000001"),
    store_id=UUID("cccccccc-0000-0000-0000-000000000001"),
    seller_id=UUID("dddddddd-0000-0000-0000-000000000001"),
    serial_number="VIQ-TEST-001",
    is_active=True,
)


@pytest.mark.asyncio
async def test_upload_chunk_success(client: AsyncClient):
    """REC-I-01: valid device_id → 201."""
    with (
        patch("app.routers.chunks.verify_device", return_value=MOCK_DEVICE_RECORD),
        patch("app.routers.chunks.upload_bytes"),
        patch("app.routers.chunks.publish", new_callable=AsyncMock),
    ):
        resp = await client.post(
            "/api/v1/recorder/chunks",
            data={
                "device_id": DEVICE_ID,
                "chunk_index": "0",
                "session_date": "2026-03-18",
                "timestamp_start": "2026-03-18T08:00:00Z",
                "timestamp_end": "2026-03-18T08:00:30Z",
            },
            files={"file": ("test.wav", make_wav_bytes(), "audio/wav")},
        )
    assert resp.status_code == 201
    assert resp.json()["status"] == "received"


@pytest.mark.asyncio
async def test_upload_chunk_unknown_device(client: AsyncClient):
    """REC-I-02: unknown device_id → 404."""
    with patch("app.routers.chunks.verify_device", return_value=None):
        resp = await client.post(
            "/api/v1/recorder/chunks",
            data={
                "device_id": "00000000-0000-0000-0000-000000000000",
                "chunk_index": "0",
                "session_date": "2026-03-18",
                "timestamp_start": "2026-03-18T08:00:00Z",
                "timestamp_end": "2026-03-18T08:00:30Z",
            },
            files={"file": ("test.wav", make_wav_bytes(), "audio/wav")},
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_chunk_inactive_device(client: AsyncClient):
    """REC-I-03: inactive device → 403."""
    inactive = DeviceRecord(
        id=UUID("aaaaaaaa-0000-0000-0000-000000000001"),
        organization_id=UUID("bbbbbbbb-0000-0000-0000-000000000001"),
        store_id=UUID("cccccccc-0000-0000-0000-000000000001"),
        seller_id=None,
        serial_number="VIQ-INACTIVE",
        is_active=False,
    )
    with patch("app.routers.chunks.verify_device", return_value=inactive):
        resp = await client.post(
            "/api/v1/recorder/chunks",
            data={
                "device_id": DEVICE_ID,
                "chunk_index": "0",
                "session_date": "2026-03-18",
                "timestamp_start": "2026-03-18T08:00:00Z",
                "timestamp_end": "2026-03-18T08:00:30Z",
            },
            files={"file": ("test.wav", make_wav_bytes(), "audio/wav")},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_upload_chunk_tenth_publishes_stitch(client: AsyncClient):
    """REC-I-04: every 10th chunk publishes to queue.stitch."""
    published = []

    async def mock_publish(queue, payload):
        published.append((queue, payload))

    with (
        patch("app.routers.chunks.verify_device", return_value=MOCK_DEVICE_RECORD),
        patch("app.routers.chunks.upload_bytes"),
        patch("app.routers.chunks.publish", side_effect=mock_publish),
    ):
        resp = await client.post(
            "/api/v1/recorder/chunks",
            data={
                "device_id": DEVICE_ID,
                "chunk_index": "10",
                "session_date": "2026-03-18",
                "timestamp_start": "2026-03-18T08:05:00Z",
                "timestamp_end": "2026-03-18T08:05:30Z",
            },
            files={"file": ("test.wav", make_wav_bytes(), "audio/wav")},
        )
    assert resp.status_code == 201
    assert any(q == "queue.stitch" for q, _ in published)


@pytest.mark.asyncio
async def test_finalize_publishes_stitch(client: AsyncClient):
    """REC-I-05: finalize → queue.stitch with finalize=True."""
    published = []

    async def mock_publish(queue, payload):
        published.append((queue, payload))

    with (
        patch("app.routers.chunks.verify_device", return_value=MOCK_DEVICE_RECORD),
        patch("app.routers.chunks.publish", side_effect=mock_publish),
    ):
        resp = await client.post(
            "/api/v1/recorder/chunks/finalize",
            data={
                "device_id": DEVICE_ID,
                "session_date": "2026-03-18",
                "total_chunks": "120",
            },
        )
    assert resp.status_code == 200
    assert any(p.get("finalize") is True for _, p in published)
