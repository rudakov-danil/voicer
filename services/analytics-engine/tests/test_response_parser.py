import pytest
import json
from app.response_parser import (
    parse_script_scoring_response,
    parse_general_analysis_response,
    LLMResponseParseError,
)


def test_parse_script_scoring_valid():
    """AN-U-05: valid JSON → ScriptScoringResponse"""
    raw = json.dumps({
        "step_scores": [
            {"step_id": "abc", "step_name": "Greeting", "score": 90.0, "detected": True, "evidence": "Hi"},
        ],
        "violations": ["No upsell"],
    })
    result = parse_script_scoring_response(raw)
    assert len(result.step_scores) == 1
    assert result.step_scores[0].score == 90.0
    assert result.violations == ["No upsell"]


def test_parse_script_scoring_invalid():
    """AN-U-06: invalid JSON → LLMResponseParseError"""
    with pytest.raises(LLMResponseParseError):
        parse_script_scoring_response("not json at all")


def test_parse_general_analysis_invalid_outcome():
    """AN-U-07: invalid outcome → LLMResponseParseError"""
    raw = json.dumps({
        "outcome": "invalid",
        "outcome_confidence": 0.9,
        "topic": "Phone",
        "sentiment_avg": 0.5,
        "objections": [],
    })
    with pytest.raises(LLMResponseParseError):
        parse_general_analysis_response(raw)
