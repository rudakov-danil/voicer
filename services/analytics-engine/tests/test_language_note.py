from unittest.mock import AsyncMock, MagicMock

import pytest

from app.llm_client import LANGUAGE_NOTE, _with_language_note, _without_thinking


def test_note_appended_to_system_prompt():
    msgs = [{"role": "system", "content": "Ты — аудитор."}, {"role": "user", "content": "текст"}]
    out = _with_language_note(msgs)
    assert out[0]["content"] == f"Ты — аудитор.\n\n{LANGUAGE_NOTE}"
    assert out[1] == msgs[1]
    assert msgs[0]["content"] == "Ты — аудитор."  # исходный список не меняется


def test_note_added_when_no_system_prompt():
    out = _with_language_note([{"role": "user", "content": "текст"}])
    assert out[0] == {"role": "system", "content": LANGUAGE_NOTE}
    assert len(out) == 2


def test_note_mentions_kazakh():
    assert "казахск" in LANGUAGE_NOTE and "Сәлеметсіз бе" in LANGUAGE_NOTE


@pytest.mark.asyncio
async def test_wrapper_sends_note_to_model():
    create = AsyncMock(return_value=MagicMock(usage=None))
    await _without_thinking(create)(model="m", messages=[{"role": "system", "content": "S"}])
    sent = create.call_args.kwargs["messages"]
    assert sent[0]["content"].endswith(LANGUAGE_NOTE)
