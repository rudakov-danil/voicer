"""Тесты логики скоринга полнотекстовых скриптов: not_applicable исключается из балла."""
import json
from unittest.mock import AsyncMock

import pytest

from worker.analyze_worker import _score_fulltext_script


def _script(blocks):
    return {"id": "s1", "name": "Скрипт", "blocks": blocks}


def _block(bid, order, mandatory=True):
    return {"id": bid, "title": f"Блок {order}", "text": "текст", "block_order": order, "is_mandatory": mandatory}


def _mock_llm(blocks_response):
    client = AsyncMock()
    msg = AsyncMock()
    msg.choices = [AsyncMock()]
    msg.choices[0].message.content = json.dumps({"blocks": blocks_response})
    client.chat.completions.create = AsyncMock(return_value=msg)
    return client


@pytest.mark.asyncio
async def test_not_applicable_excluded_from_score():
    """Ситуативный блок not_applicable не должен тянуть балл вниз."""
    script = _script([
        _block("b1", 1, mandatory=True),
        _block("b2", 2, mandatory=False),  # ситуативный — ситуация не возникла
    ])
    llm = _mock_llm([
        {"block_id": "b1", "status": "spoken", "quote": "Здравствуйте", "comment": ""},
        {"block_id": "b2", "status": "not_applicable", "quote": "", "comment": "клиент не возражал"},
    ])
    result = await _score_fulltext_script([], script, llm)
    # Балл только по b1 (spoken=100), b2 исключён
    assert result["script_score"] == 100.0
    assert not result["violations"]


@pytest.mark.asyncio
async def test_situational_missed_penalized():
    """Ситуативный блок, чья ситуация ВОЗНИКЛА, но не отработан → missed, штрафуем."""
    script = _script([
        _block("b1", 1, mandatory=True),
        _block("b2", 2, mandatory=False),
    ])
    llm = _mock_llm([
        {"block_id": "b1", "status": "spoken", "quote": "x", "comment": ""},
        {"block_id": "b2", "status": "missed", "quote": "", "comment": "клиент возразил, но не ответили"},
    ])
    result = await _score_fulltext_script([], script, llm)
    assert result["script_score"] == 50.0  # (100 + 0) / 2
    assert len(result["violations"]) == 1


@pytest.mark.asyncio
async def test_mandatory_not_applicable_coerced_to_missed():
    """Обязательный блок нельзя сделать not_applicable — трактуем как missed."""
    script = _script([_block("b1", 1, mandatory=True)])
    llm = _mock_llm([
        {"block_id": "b1", "status": "not_applicable", "quote": "", "comment": ""},
    ])
    result = await _score_fulltext_script([], script, llm)
    assert result["block_results"][0]["status"] == "missed"
    assert result["script_score"] == 0.0


@pytest.mark.asyncio
async def test_missing_situational_block_is_na():
    """Ситуативный блок, который LLM не вернул, считаем not_applicable (не штрафуем)."""
    script = _script([
        _block("b1", 1, mandatory=True),
        _block("b2", 2, mandatory=False),
    ])
    llm = _mock_llm([
        {"block_id": "b1", "status": "spoken", "quote": "x", "comment": ""},
        # b2 не возвращён
    ])
    result = await _score_fulltext_script([], script, llm)
    b2 = next(b for b in result["block_results"] if b["block_id"] == "b2")
    assert b2["status"] == "not_applicable"
    assert result["script_score"] == 100.0  # только b1


@pytest.mark.asyncio
async def test_all_situational_none_arose_score_none():
    """Если ни один блок не потребовался — балл не выставляется (None)."""
    script = _script([
        _block("b1", 1, mandatory=False),
        _block("b2", 2, mandatory=False),
    ])
    llm = _mock_llm([
        {"block_id": "b1", "status": "not_applicable", "quote": "", "comment": ""},
        {"block_id": "b2", "status": "not_applicable", "quote": "", "comment": ""},
    ])
    result = await _score_fulltext_script([], script, llm)
    assert result["script_score"] is None
