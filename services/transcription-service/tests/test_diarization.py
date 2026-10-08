import pytest
from unittest.mock import AsyncMock, MagicMock

from app.diarization import diarize_segments, roles_by_talk_time, segment_conversations


def make_mock_llm(response_content: str):
    mock_choice = MagicMock()
    mock_choice.message.content = response_content
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client = MagicMock()
    mock_client.chat = MagicMock()
    mock_client.chat.completions = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_diarize_valid_response():
    """TRANS-U-01: valid LLM response -> correct roles list."""
    segments = [
        {"text": "Здравствуйте, чем могу помочь?", "start_ms": 0, "end_ms": 2500},
        {"text": "Меня интересует холодильник.", "start_ms": 3100, "end_ms": 5800},
        {"text": "Вот наши модели.", "start_ms": 6000, "end_ms": 8000},
    ]
    llm = make_mock_llm('[{"index": 0, "role": "seller"}, {"index": 1, "role": "customer"}, {"index": 2, "role": "seller"}]')
    roles = await diarize_segments(segments, "Иван Петров", llm)
    assert len(roles) == 3
    assert roles[0] == "seller"
    assert roles[1] == "customer"
    assert roles[2] == "seller"


@pytest.mark.asyncio
async def test_diarize_invalid_json_fallback():
    """TRANS-U-02: invalid JSON -> all roles 'unknown'."""
    segments = [{"text": "Текст", "start_ms": 0, "end_ms": 1000}]
    llm = make_mock_llm("not valid json at all")
    roles = await diarize_segments(segments, "Иван", llm)
    assert roles == ["unknown"]


@pytest.mark.asyncio
async def test_diarize_partial_response():
    """TRANS-U-03: partial list -> missing roles = 'unknown'."""
    segments = [
        {"text": "Реплика 0", "start_ms": 0, "end_ms": 1000},
        {"text": "Реплика 1", "start_ms": 1000, "end_ms": 2000},
        {"text": "Реплика 2", "start_ms": 2000, "end_ms": 3000},
        {"text": "Реплика 3", "start_ms": 3000, "end_ms": 4000},
        {"text": "Реплика 4", "start_ms": 4000, "end_ms": 5000},
    ]
    llm = make_mock_llm('[{"index": 0, "role": "seller"}, {"index": 2, "role": "customer"}]')
    roles = await diarize_segments(segments, "Иван", llm)
    assert len(roles) == 5
    assert roles[0] == "seller"
    assert roles[1] == "unknown"
    assert roles[2] == "customer"
    assert roles[3] == "unknown"
    assert roles[4] == "unknown"


@pytest.mark.asyncio
async def test_diarize_prompt_contains_seller_name():
    """TRANS-U-04: prompt is formed with seller_name."""
    segments = [{"text": "Привет", "start_ms": 0, "end_ms": 500}]
    captured_messages = []

    async def mock_create(**kwargs):
        captured_messages.extend(kwargs["messages"])
        mock_choice = MagicMock()
        mock_choice.message.content = '[{"index": 0, "role": "seller"}]'
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        return mock_response

    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create

    await diarize_segments(segments, "Мария Иванова", mock_client)
    system_msg = next(m for m in captured_messages if m["role"] == "system")
    assert "Мария Иванова" in system_msg["content"]


@pytest.mark.asyncio
async def test_segment_conversations_valid():
    """segment_conversations returns list of boundaries."""
    whisper_result = {
        "text": "full text",
        "segments": [
            {"start": 0.0, "end": 10.0, "text": "Здравствуйте"},
            {"start": 120.0, "end": 130.0, "text": "До свидания"},
        ],
    }
    llm = make_mock_llm('[{"start_ms": 0, "end_ms": 10000}, {"start_ms": 120000, "end_ms": 130000}]')
    boundaries = await segment_conversations(whisper_result, llm)
    assert len(boundaries) == 2
    assert boundaries[0]["start_ms"] == 0
    assert boundaries[0]["end_ms"] == 10000


def test_roles_by_talk_time_longest_speaker_is_seller():
    segments = [
        {"text": "Здравствуйте", "start_ms": 0, "end_ms": 1000, "speaker_id": 1},
        {"text": "Подскажу по моделям", "start_ms": 1200, "end_ms": 6000, "speaker_id": 0},
        {"text": "Спасибо", "start_ms": 6100, "end_ms": 7000, "speaker_id": 1},
        {"text": "шум", "start_ms": 7100, "end_ms": 7300, "speaker_id": None},
    ]
    assert roles_by_talk_time(segments) == ["customer", "seller", "customer", "unknown"]


def test_roles_by_talk_time_single_or_no_speaker():
    one = [{"text": "а", "start_ms": 0, "end_ms": 500, "speaker_id": 0}]
    assert roles_by_talk_time(one) == ["seller"]
    none = [{"text": "а", "start_ms": 0, "end_ms": 500, "speaker_id": None}]
    assert roles_by_talk_time(none) == ["unknown"]
