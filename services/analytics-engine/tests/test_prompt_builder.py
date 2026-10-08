import pytest
from unittest.mock import AsyncMock, MagicMock
from app.prompt_builder import build_script_prompt, build_general_prompt, screen_contextual_script

SEGMENTS = [
    {"start_ms": 0, "end_ms": 5000, "text": "Добрый день!", "speaker_role": "seller"},
    {"start_ms": 5000, "end_ms": 10000, "text": "Здравствуйте", "speaker_role": "customer"},
]

SCRIPT = {
    "id": "script-1",
    "name": "Test Script",
    "context_description": "Для продажи смартфонов",
    "steps": [
        {"id": "step-1", "name": "Greeting", "weight": 0.5, "step_order": 1, "description": "Say hello"},
        {"id": "step-2", "name": "Close", "weight": 0.5, "step_order": 2, "description": "Close the deal"},
    ],
}


def test_build_script_prompt_includes_step_ids():
    """AN-U-08: prompt includes ID and name of each step"""
    system, user = build_script_prompt(SEGMENTS, SCRIPT)
    assert "step-1" in system
    assert "Greeting" in system
    assert "step-2" in system
    assert "Close" in system


def test_build_general_prompt_formats_roles():
    """AN-U-09: formats ПРОДАВЕЦ/КЛИЕНТ labels"""
    _, user = build_general_prompt(SEGMENTS)
    assert "ПРОДАВЕЦ" in user
    assert "КЛИЕНТ" in user


@pytest.mark.asyncio
async def test_screen_no_context_description():
    """AN-U-10: context_description=null → (True, 'no context filter') without LLM"""
    mock_llm = MagicMock()
    script_no_ctx = {**SCRIPT, "context_description": None}
    result = await screen_contextual_script(SEGMENTS, script_no_ctx, mock_llm)
    assert result == (True, "no context filter")
    mock_llm.chat.completions.create.assert_not_called()


@pytest.mark.asyncio
async def test_screen_llm_returns_false():
    """AN-U-11: LLM returns applicable=false → (False, reason)"""
    import json
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps({"applicable": False, "reason": "Wrong topic"})
    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(return_value=mock_resp)

    result = await screen_contextual_script(SEGMENTS, SCRIPT, mock_llm)
    assert result == (False, "Wrong topic")


@pytest.mark.asyncio
async def test_screen_llm_parse_error():
    """AN-U-12: invalid JSON from LLM → (False, 'LLM_PARSE_ERROR:...')"""
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = "not json"
    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(return_value=mock_resp)

    result = await screen_contextual_script(SEGMENTS, SCRIPT, mock_llm)
    assert result[0] is False
    assert "LLM_PARSE_ERROR" in result[1]


def test_summary_prompt_has_sections_parsed_by_card():
    """Карточка разговора разбирает резюме по этим заголовкам (SummaryPanel во фронтенде)."""
    from app.prompt_builder import build_summary_prompt
    system, user = build_summary_prompt([{"speaker_role": "seller", "text": "Добрый день", "start_ms": 0}])
    for head in ("**Итог:**", "**Риск претензии:**", "**Что сработало:**", "**Что поправить:**"):
        assert head in system
    assert "продавец" in system
    assert "Добрый день" in user
