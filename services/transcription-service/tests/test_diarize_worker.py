import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select

from app.models import Transcript, TranscriptSegment


class MockCtx:
    async def __aenter__(self): return None
    async def __aexit__(self, *a): pass


@pytest.mark.asyncio
async def test_diarize_worker_updates_roles(db_engine, test_transcript):
    """TRANS-I-05: worker updates speaker_role in segments."""
    from worker.diarize_worker import process_diarize_message
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    payload = {
        "recording_id": str(test_transcript.recording_id),
        "transcript_id": str(test_transcript.id),
        "seller_id": "dddddddd-0000-0000-0000-000000000001",
        "store_id": "cccccccc-0000-0000-0000-000000000001",
        "organization_id": "bbbbbbbb-0000-0000-0000-000000000001",
    }

    message = MagicMock()
    message.body = json.dumps(payload).encode()
    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.diarize_worker.diarize_segments",
              new_callable=AsyncMock,
              return_value=["seller", "customer"]),
        patch("worker.diarize_worker.publish", new_callable=AsyncMock),
        patch("httpx.AsyncClient") as mock_http,
    ):
        mock_http.return_value.__aenter__.return_value.get = AsyncMock(
            return_value=MagicMock(status_code=200, json=lambda: {
                "first_name": "Иван", "last_name": "Петров"
            })
        )
        mock_http.return_value.__aenter__.return_value.patch = AsyncMock(
            return_value=MagicMock(status_code=200)
        )
        await process_diarize_message(message, session_maker)

    async with session_maker() as db:
        result = await db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == test_transcript.id)
            .order_by(TranscriptSegment.segment_index)
        )
        segs = result.scalars().all()
        assert segs[0].speaker_role == "seller"
        assert segs[1].speaker_role == "customer"


@pytest.mark.asyncio
async def test_diarize_worker_publishes_analyze(db_engine, test_transcript):
    """TRANS-I-06: worker publishes to queue.analyze."""
    from worker.diarize_worker import process_diarize_message
    session_maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    published = []

    async def mock_publish(queue, payload):
        published.append((queue, payload))

    payload = {
        "recording_id": str(test_transcript.recording_id),
        "transcript_id": str(test_transcript.id),
        "seller_id": "dddddddd-0000-0000-0000-000000000001",
        "store_id": "cccccccc-0000-0000-0000-000000000001",
        "organization_id": "bbbbbbbb-0000-0000-0000-000000000001",
    }

    message = MagicMock()
    message.body = json.dumps(payload).encode()
    message.process = MagicMock(return_value=MockCtx())

    with (
        patch("worker.diarize_worker.diarize_segments",
              new_callable=AsyncMock,
              return_value=["seller", "customer"]),
        patch("worker.diarize_worker.publish", side_effect=mock_publish),
        patch("httpx.AsyncClient") as mock_http,
    ):
        mock_http.return_value.__aenter__.return_value.get = AsyncMock(
            return_value=MagicMock(status_code=200, json=lambda: {
                "first_name": "Иван", "last_name": "Петров"
            })
        )
        mock_http.return_value.__aenter__.return_value.patch = AsyncMock(
            return_value=MagicMock(status_code=200)
        )
        await process_diarize_message(message, session_maker)

    assert any(q == "queue.analyze" for q, _ in published)
