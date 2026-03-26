import io
import json
import wave
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def make_wav(duration_ms: int = 5000) -> bytes:
    num_samples = int(16000 * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


PAYLOAD = {
    "device_id": "aaaaaaaa-0000-0000-0000-000000000001",
    "seller_id": "dddddddd-0000-0000-0000-000000000001",
    "store_id": "cccccccc-0000-0000-0000-000000000001",
    "organization_id": "bbbbbbbb-0000-0000-0000-000000000001",
    "audio_path": "voiceiq-audio-full/bbbbbbbb/aaaaaaaa/2026-03-18/full_day.wav",
    "session_date": "2026-03-18",
}

MOCK_WHISPER = {
    "text": "Здравствуйте чем могу помочь Меня интересует холодильник До свидания",
    "language": "ru",
    "segments": [
        {"start": 0.0, "end": 2.5, "text": "Здравствуйте, чем могу помочь?", "avg_logprob": -0.2},
        {"start": 3.1, "end": 5.8, "text": "Меня интересует холодильник.", "avg_logprob": -0.15},
        {"start": 6.0, "end": 7.5, "text": "До свидания.", "avg_logprob": -0.1},
    ],
}

MOCK_BOUNDARIES = [{"start_ms": 0, "end_ms": 7500}]


class MockCtx:
    async def __aenter__(self): return None
    async def __aexit__(self, *a): pass


@pytest.mark.asyncio
async def test_transcribe_worker_calls_whisper(db_engine):
    """TRANS-I-01: worker calls Whisper and gets transcript."""
    from worker.transcribe_worker import process_transcribe_full_message
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    message = MagicMock()
    message.body = json.dumps(PAYLOAD).encode()
    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.transcribe_worker.download_bytes", return_value=make_wav()),
        patch("worker.transcribe_worker.transcribe_audio", new_callable=AsyncMock, return_value=MOCK_WHISPER),
        patch("worker.transcribe_worker.segment_conversations", new_callable=AsyncMock, return_value=MOCK_BOUNDARIES),
        patch("worker.transcribe_worker.upload_bytes"),
        patch("worker.transcribe_worker.delete_object"),
        patch("worker.transcribe_worker.publish", new_callable=AsyncMock),
        patch("httpx.AsyncClient") as mock_http,
    ):
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_http.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)
        await process_transcribe_full_message(message, session_maker)


@pytest.mark.asyncio
async def test_transcribe_worker_publishes_diarize(db_engine):
    """TRANS-I-04: worker publishes to queue.diarize for each conversation."""
    from worker.transcribe_worker import process_transcribe_full_message
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    published = []

    async def mock_publish(queue, payload):
        published.append((queue, payload))

    message = MagicMock()
    message.body = json.dumps(PAYLOAD).encode()
    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.transcribe_worker.download_bytes", return_value=make_wav()),
        patch("worker.transcribe_worker.transcribe_audio", new_callable=AsyncMock, return_value=MOCK_WHISPER),
        patch("worker.transcribe_worker.segment_conversations", new_callable=AsyncMock, return_value=MOCK_BOUNDARIES),
        patch("worker.transcribe_worker.upload_bytes"),
        patch("worker.transcribe_worker.delete_object"),
        patch("worker.transcribe_worker.publish", side_effect=mock_publish),
        patch("httpx.AsyncClient") as mock_http,
    ):
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_http.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)
        await process_transcribe_full_message(message, session_maker)

    assert any(q == "queue.diarize" for q, _ in published)


@pytest.mark.asyncio
async def test_transcribe_worker_deletes_full_day(db_engine):
    """TRANS-I-05: worker deletes full_day.wav after processing."""
    from worker.transcribe_worker import process_transcribe_full_message
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    deleted = []

    def mock_delete(bucket, obj):
        deleted.append(f"{bucket}/{obj}")

    message = MagicMock()
    message.body = json.dumps(PAYLOAD).encode()
    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.transcribe_worker.download_bytes", return_value=make_wav()),
        patch("worker.transcribe_worker.transcribe_audio", new_callable=AsyncMock, return_value=MOCK_WHISPER),
        patch("worker.transcribe_worker.segment_conversations", new_callable=AsyncMock, return_value=MOCK_BOUNDARIES),
        patch("worker.transcribe_worker.upload_bytes"),
        patch("worker.transcribe_worker.delete_object", side_effect=mock_delete),
        patch("worker.transcribe_worker.publish", new_callable=AsyncMock),
        patch("httpx.AsyncClient") as mock_http,
    ):
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_http.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)
        await process_transcribe_full_message(message, session_maker)

    assert any("full_day.wav" in d for d in deleted)
