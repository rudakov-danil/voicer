import io
import json
import wave
import uuid
import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import AudioChunk


def make_wav(duration_ms: int = 1000) -> bytes:
    num_samples = int(16000 * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


ORG_ID = "bbbbbbbb-0000-0000-0000-000000000001"
DEVICE_ID = "aaaaaaaa-0000-0000-0000-000000000001"
STORE_ID = "cccccccc-0000-0000-0000-000000000001"
SELLER_ID = "dddddddd-0000-0000-0000-000000000001"
SESSION_DATE = "2026-03-18"


@pytest_asyncio.fixture
async def chunks_in_db(db_session: AsyncSession):
    """Insert 3 unstitched chunks into the test DB."""
    chunks = []
    for i in range(3):
        chunk = AudioChunk(
            organization_id=ORG_ID,
            device_id=DEVICE_ID,
            session_date=SESSION_DATE,
            chunk_index=i,
            duration_ms=1000,
            audio_path=f"voiceiq-audio-chunks/{ORG_ID}/{DEVICE_ID}/{SESSION_DATE}/{i:06d}_test.wav",
            timestamp_start=__import__("datetime").datetime(2026, 3, 18, 8, i, 0, tzinfo=__import__("datetime").timezone.utc),
            timestamp_end=__import__("datetime").datetime(2026, 3, 18, 8, i, 1, tzinfo=__import__("datetime").timezone.utc),
        )
        db_session.add(chunk)
        chunks.append(chunk)
    await db_session.commit()
    return chunks


@pytest.mark.asyncio
async def test_stitch_worker_stitches_chunks(db_engine, chunks_in_db):
    """REC-W-01/02: worker stitches chunks and saves to MinIO."""
    from worker.stitch_worker import process_stitch_message

    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    payload = {
        "device_id": DEVICE_ID,
        "session_date": SESSION_DATE,
        "organization_id": ORG_ID,
        "store_id": STORE_ID,
        "seller_id": SELLER_ID,
    }

    uploaded = {}

    def mock_upload(bucket, obj, data, **kwargs):
        uploaded[f"{bucket}/{obj}"] = data

    def mock_download(bucket, obj):
        return make_wav(1000)

    message = MagicMock()
    message.body = json.dumps(payload).encode()
    message.process = MagicMock(return_value=AsyncMock().__aenter__.return_value)

    class MockCtx:
        async def __aenter__(self): return None
        async def __aexit__(self, *a): pass

    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.stitch_worker.download_bytes", side_effect=mock_download),
        patch("worker.stitch_worker.upload_bytes", side_effect=mock_upload),
        patch("worker.stitch_worker.publish", new_callable=AsyncMock) as mock_publish,
    ):
        await process_stitch_message(message, session_maker)

    # Verify something was uploaded to voiceiq-audio-full
    assert any("voiceiq-audio-full" in k for k in uploaded)

    # Verify queue.transcribe_full was published
    mock_publish.assert_called_once()
    call_args = mock_publish.call_args
    assert call_args[0][0] == "queue.transcribe_full"
    assert call_args[0][1]["device_id"] == DEVICE_ID


@pytest.mark.asyncio
async def test_stitch_worker_marks_stitched(db_engine, chunks_in_db, db_session):
    """REC-W-04: worker marks chunks as stitched."""
    from worker.stitch_worker import process_stitch_message
    from sqlalchemy import select

    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    payload = {
        "device_id": DEVICE_ID,
        "session_date": SESSION_DATE,
        "organization_id": ORG_ID,
        "store_id": STORE_ID,
        "seller_id": SELLER_ID,
    }

    class MockCtx:
        async def __aenter__(self): return None
        async def __aexit__(self, *a): pass

    message = MagicMock()
    message.body = json.dumps(payload).encode()
    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.stitch_worker.download_bytes", return_value=make_wav(1000)),
        patch("worker.stitch_worker.upload_bytes"),
        patch("worker.stitch_worker.publish", new_callable=AsyncMock),
    ):
        await process_stitch_message(message, session_maker)

    # Re-query — chunks should be stitched now
    result = await db_session.execute(
        select(AudioChunk).where(
            AudioChunk.device_id == DEVICE_ID,
            AudioChunk.session_date == SESSION_DATE,
        )
    )
    for chunk in result.scalars().all():
        assert chunk.stitched is True
