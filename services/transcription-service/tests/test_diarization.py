import pytest
from unittest.mock import AsyncMock, MagicMock

from app.diarization import (
    build_resolve_prompt, build_speaker_recheck_prompt, diarize_segments, parse_resolve_answer,
    parse_speaker_recheck, recheck_uncertain_speakers, resolve_speakers_and_roles,
    roles_by_talk_time, segment_conversations, uncertain_speaker_indexes,
)


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


# Перебивание: «Я думаю…» и «Ладно, хорошо…» Deepgram отдал одному спикеру с низкой уверенностью
INTERRUPTED = [
    {"text": "Здравствуйте, проверяем запись.", "speaker_id": 0, "speaker_confidence": 1.0},
    {"text": "А если они будут перебивать друг друга? Не,", "speaker_id": 1, "speaker_confidence": 1.0},
    {"text": "Я думаю, вообще без проблем будет.", "speaker_id": 2, "speaker_confidence": 0.77},
    {"text": "Ладно, хорошо, мы сейчас проверим эту гипотезу.", "speaker_id": 2, "speaker_confidence": 0.75},
    {"text": "Хорошо.", "speaker_id": 2, "speaker_confidence": 0.99},
]


def test_uncertain_speaker_indexes_below_threshold_only():
    segs = INTERRUPTED + [{"text": "шум", "speaker_id": None, "speaker_confidence": 0.1},
                          {"text": "старая запись", "speaker_id": 1, "speaker_confidence": None}]
    assert uncertain_speaker_indexes(segs) == [2, 3]


def test_speaker_recheck_prompt_marks_uncertain_lines():
    prompt = build_speaker_recheck_prompt(INTERRUPTED, [2, 3])
    assert "Спикеры: 0, 1, 2" in prompt
    assert "[2] спикер 2 ?: Я думаю" in prompt
    assert "[1] спикер 1: А если" in prompt
    assert "Строки с «?»: 2, 3" in prompt


def test_speaker_recheck_prompt_skips_far_lines():
    segs = [{"text": f"реплика {i}", "speaker_id": i % 2, "speaker_confidence": 1.0} for i in range(20)]
    segs[10]["speaker_confidence"] = 0.5
    prompt = build_speaker_recheck_prompt(segs, [10])
    assert "[5]" not in prompt and "[6] " in prompt and "[14] " in prompt and "[15]" not in prompt
    assert prompt.count("…") == 2


def test_parse_speaker_recheck_ignores_unknown_lines_and_speakers():
    raw = "2: 2\n3: спикер 1\n4: 0\n3 - 7"
    assert parse_speaker_recheck(raw, [2, 3], {0, 1, 2}) == {2: 2, 3: 1}


@pytest.mark.asyncio
async def test_recheck_uncertain_speakers_moves_reply_to_other_speaker():
    llm = make_mock_llm("2: 2\n3: 1")
    assert await recheck_uncertain_speakers(INTERRUPTED, llm) == [0, 1, 2, 1, 2]
    llm.chat.completions.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_recheck_uncertain_speakers_keeps_deepgram_on_bad_answer():
    llm = make_mock_llm("не знаю")
    assert await recheck_uncertain_speakers(INTERRUPTED, llm) == [0, 1, 2, 2, 2]
    assert llm.chat.completions.create.await_count == 2


@pytest.mark.asyncio
async def test_recheck_uncertain_speakers_no_llm_when_confident():
    llm = make_mock_llm("")
    confident = [dict(s, speaker_confidence=1.0) for s in INTERRUPTED]
    assert await recheck_uncertain_speakers(confident, llm) == [0, 1, 2, 2, 2]
    llm.chat.completions.create.assert_not_called()


# Как на записи с перебиванием: Deepgram отдал сомнительные фразы лишнему кластеру 2
PHANTOM = [
    {"text": "Добрый день, проверяем запись.", "speaker_id": 0, "speaker_confidence": 1.0},
    {"text": "Да, слышно.", "speaker_id": 1, "speaker_confidence": 0.99},
    {"text": "А если они будут перебивать друг друга? Не,", "speaker_id": 1, "speaker_confidence": 1.0},
    {"text": "Я думаю, вообще без проблем будет.", "speaker_id": 2, "speaker_confidence": 0.77},
    {"text": "Ладно, хорошо, проверим, господин Даниил.", "speaker_id": 2, "speaker_confidence": 0.75},
]


def test_resolve_prompt_hides_unreliable_speakers():
    prompt = build_resolve_prompt(PHANTOM, [3, 4], [0, 1])
    assert "Спикеры: 0, 1" in prompt
    assert "[3] спикер ?: Я думаю" in prompt and "[4] спикер ?: Ладно" in prompt
    assert "[2] спикер 1: А если" in prompt
    assert "спикер 2" not in prompt
    assert "Другие реплики" not in prompt


def test_resolve_prompt_adds_examples_for_long_conversation():
    segs = [{"text": f"реплика {i}", "speaker_id": i % 2, "speaker_confidence": 1.0} for i in range(30)]
    segs[20]["speaker_confidence"] = 0.5
    prompt = build_resolve_prompt(segs, [20], [0, 1])
    assert "Другие реплики спикеров" in prompt and "  - реплика 0" in prompt
    assert "[20] спикер ?: реплика 20" in prompt


def test_parse_resolve_answer():
    workers, lines = parse_resolve_answer("WORKERS: 0\n3: 0\n4: 1\n5: 2", [3, 4], [0, 1])
    assert workers == {0}
    assert lines == {3: 0, 4: 1}


@pytest.mark.asyncio
async def test_resolve_speakers_and_roles_one_request():
    llm = make_mock_llm("WORKERS: 0\n3: 0\n4: 1")
    ids, roles = await resolve_speakers_and_roles(PHANTOM, "Даниил Рудаков", llm)
    assert ids == [0, 1, 1, 0, 1]
    assert roles == ["seller", "customer", "customer", "seller", "customer"]
    llm.chat.completions.create.assert_awaited_once()
    system = llm.chat.completions.create.await_args.kwargs["messages"][0]["content"]
    assert "Имя работника: Даниил Рудаков" in system


@pytest.mark.asyncio
async def test_resolve_speakers_and_roles_all_workers_keeps_most_talkative():
    llm = make_mock_llm("WORKERS: 0, 1\n3: 0\n4: 1")
    _, roles = await resolve_speakers_and_roles(PHANTOM, "Даниил", llm)
    assert roles.count("seller") in (2, 3) and "customer" in roles


@pytest.mark.asyncio
async def test_resolve_speakers_and_roles_without_workers_returns_none():
    llm = make_mock_llm("3: 0\n4: 1")
    assert await resolve_speakers_and_roles(PHANTOM, "Даниил", llm) is None
    assert llm.chat.completions.create.await_count == 2


@pytest.mark.asyncio
async def test_resolve_speakers_and_roles_skips_confident_conversation():
    llm = make_mock_llm("")
    confident = [dict(s, speaker_confidence=1.0) for s in PHANTOM]
    assert await resolve_speakers_and_roles(confident, "Даниил", llm) is None
    llm.chat.completions.create.assert_not_called()
