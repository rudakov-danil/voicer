from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies import SERVICE_USER, get_current_user
from app.main import app

URL = "/api/v1/transcription/internal/segment-conversations"
BODY = {"segments": [{"start": 0.0, "end": 2.0, "text": "Здравствуйте"}, {"start": 3.0, "end": 4.0, "text": " "}]}


async def _post(user):
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            return await c.post(URL, json=BODY)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_service_gets_boundaries():
    found = [{"start_ms": 0, "end_ms": 2000}]
    with patch("app.routers.segmentation.segment_conversations", AsyncMock(return_value=found)) as seg, \
         patch("app.routers.segmentation.get_llm_client"):
        resp = await _post(SERVICE_USER)
    assert resp.status_code == 200
    assert resp.json() == {"conversations": found}
    # пустые реплики в LLM не уходят
    assert seg.call_args.args[0] == {"segments": [{"start": 0.0, "end": 2.0, "text": "Здравствуйте"}]}


@pytest.mark.asyncio
async def test_regular_user_is_rejected():
    resp = await _post({"sub": "u", "role": "director", "organization_id": "o"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_segment_conversations_accepts_fenced_json():
    """deepseek отвечает ```json [...] ``` — границы всё равно разбираются."""
    from unittest.mock import MagicMock
    from app.diarization import segment_conversations

    choice = MagicMock()
    choice.message.content = '```json\n[\n  {"start_ms": 2300, "end_ms": 30200},\n  {"start_ms": 39000, "end_ms": 46000}\n]\n```'
    llm = MagicMock()
    llm.chat.completions.create = AsyncMock(return_value=MagicMock(choices=[choice]))
    result = await segment_conversations({"segments": [{"start": 2.3, "end": 46.0, "text": "…"}]}, llm)
    assert result == [{"start_ms": 2300, "end_ms": 30200}, {"start_ms": 39000, "end_ms": 46000}]
