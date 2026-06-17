"""Тесты телефонийных исходов и парсинга fulltext-скоринга — без БД и LLM."""
import json

import pytest

from app.prompt_builder import build_fulltext_script_prompt, build_general_prompt, is_call_context
from app.response_parser import (
    LLMResponseParseError,
    parse_fulltext_scoring_response,
    parse_general_analysis_response,
)


def test_telephony_outcomes_accepted():
    for outcome in ("appointment", "callback", "refusal", "transfer", "non_target", "voicemail"):
        raw = json.dumps({
            "outcome": outcome, "outcome_confidence": 0.9,
            "topic": None, "sentiment_avg": 0.1, "objections": [],
        })
        parsed = parse_general_analysis_response(raw)
        assert parsed.outcome == outcome


def test_retail_outcomes_still_accepted():
    raw = json.dumps({
        "outcome": "price_refusal", "outcome_confidence": 0.8,
        "topic": "телевизор", "sentiment_avg": -0.2, "objections": [],
    })
    assert parse_general_analysis_response(raw).outcome == "price_refusal"


def test_invalid_outcome_rejected():
    raw = json.dumps({
        "outcome": "nonsense", "outcome_confidence": 0.8,
        "topic": None, "sentiment_avg": 0, "objections": [],
    })
    with pytest.raises(LLMResponseParseError):
        parse_general_analysis_response(raw)


def test_is_call_context():
    assert is_call_context({"source": "call_webhook"}) is True
    assert is_call_context({"source": "call_manual"}) is True
    # Транскрипт с направлением — тоже звонок (загрузка для тестов)
    assert is_call_context({"source": "transcript", "call_direction": "inbound"}) is True
    assert is_call_context({"source": "transcript", "call_direction": None}) is False
    assert is_call_context({"source": "badge"}) is False
    assert is_call_context(None) is False


def test_general_prompt_switches_to_telephony():
    segments = [{"speaker_role": "seller", "text": "Алло", "start_ms": 0}]
    system_retail, _ = build_general_prompt(segments, {"source": "badge"})
    system_call, _ = build_general_prompt(segments, {"source": "call_webhook", "call_direction": "inbound"})
    assert "voicemail" not in system_retail
    assert "voicemail" in system_call
    assert "входящий" in system_call


def test_fulltext_prompt_contains_blocks():
    script = {
        "name": "Скрипт КЦ",
        "blocks": [
            {"id": "b1", "title": "Приветствие", "text": "Здравствуйте, компания X", "is_mandatory": True, "block_order": 1},
            {"id": "b2", "title": "Возражение по цене", "text": "Понимаю вас...", "is_mandatory": False, "block_order": 2},
        ],
    }
    system, _ = build_fulltext_script_prompt([{"speaker_role": "seller", "text": "x", "start_ms": 0}], script)
    assert "ID=b1" in system
    assert "обязательный" in system
    assert "ситуативный" in system


def test_parse_fulltext_scoring():
    raw = json.dumps({"blocks": [
        {"block_id": "b1", "status": "spoken", "quote": "Здравствуйте", "comment": ""},
        {"block_id": "b2", "status": "missed", "quote": "", "comment": "ситуация не возникла"},
    ]})
    parsed = parse_fulltext_scoring_response(raw)
    assert len(parsed.blocks) == 2
    assert parsed.blocks[0].status == "spoken"


def test_parse_fulltext_bad_status_rejected():
    raw = json.dumps({"blocks": [{"block_id": "b1", "status": "kinda", "quote": "", "comment": ""}]})
    with pytest.raises(LLMResponseParseError):
        parse_fulltext_scoring_response(raw)


def test_parse_fulltext_salvages_truncated_json():
    """Ответ оборван по лимиту токенов на середине последнего блока — спасаем целые."""
    truncated = (
        '{"blocks": ['
        '{"block_id": "b1", "status": "spoken", "quote": "Здравствуйте", "comment": ""},'
        '{"block_id": "b2", "status": "missed", "quote": "", "comment": ""},'
        '{"block_id": "b3", "status": "para'  # обрыв
    )
    parsed = parse_fulltext_scoring_response(truncated)
    assert len(parsed.blocks) == 2
    assert parsed.blocks[0].block_id == "b1"
    assert parsed.blocks[1].block_id == "b2"


def test_parse_fulltext_not_applicable_status():
    raw = json.dumps({"blocks": [{"block_id": "b1", "status": "not_applicable", "quote": "", "comment": "не возникло"}]})
    parsed = parse_fulltext_scoring_response(raw)
    assert parsed.blocks[0].status == "not_applicable"
