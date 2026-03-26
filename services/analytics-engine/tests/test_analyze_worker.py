import pytest
import uuid
import json
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from tests.conftest import (
    ORG_ID, STORE_ID, SELLER_ID, RECORDING_ID, TRANSCRIPT_ID,
    SAMPLE_SEGMENTS, SAMPLE_SCRIPTS, SAMPLE_SCRIPTS_TWO, make_llm_response,
)
from app.models import Conversation, ConversationScriptResult


def _make_message(payload: dict):
    msg = MagicMock()
    msg.body = json.dumps(payload).encode()
    msg.process = MagicMock()
    msg.process.return_value.__aenter__ = AsyncMock(return_value=None)
    msg.process.return_value.__aexit__ = AsyncMock(return_value=False)
    return msg


def _make_llm_client(script_content: str, general_content: str):
    import json as _json
    mock_llm = MagicMock()

    call_count = [0]

    async def side_effect(**kwargs):
        call_count[0] += 1
        content = kwargs.get("messages", [{}])[0].get("content", "")
        if "outcome" not in content and "sentiment" not in content:
            return make_llm_response(script_content)
        return make_llm_response(general_content)

    mock_llm.chat.completions.create = AsyncMock(side_effect=side_effect)
    return mock_llm


GOOD_SCRIPT_RESPONSE = json.dumps({
    "step_scores": [
        {"step_id": SAMPLE_SCRIPTS[0]["steps"][0]["id"], "step_name": "Приветствие", "score": 80.0, "detected": True, "evidence": "Добрый день"},
        {"step_id": SAMPLE_SCRIPTS[0]["steps"][1]["id"], "step_name": "Закрытие", "score": 60.0, "detected": True, "evidence": ""},
    ],
    "violations": [],
})

GOOD_GENERAL_RESPONSE = json.dumps({
    "outcome": "purchase",
    "outcome_confidence": 0.9,
    "topic": "Телефон",
    "sentiment_avg": 0.7,
    "objections": [
        {"type": "price", "is_resolved": True, "resolution_technique": "trade-in", "raw_text": "Дорого"}
    ],
})


@pytest.mark.asyncio
async def test_worker_two_scripts(db_session):
    """AN-I-01: 2 scripts → 2 records in conversation_script_results"""
    from worker.analyze_worker import process_analyze_message

    rec_id = str(uuid.uuid4())
    payload = {
        "recording_id": rec_id,
        "transcript_id": str(uuid.uuid4()),
        "seller_id": SELLER_ID,
        "store_id": STORE_ID,
        "organization_id": ORG_ID,
    }

    script1_step_id = str(uuid.uuid4())
    script2_step_id = str(uuid.uuid4())
    two_scripts = [
        {
            "id": str(uuid.uuid4()),
            "name": "Script A",
            "is_mandatory": True,
            "context_description": None,
            "steps": [{"id": script1_step_id, "name": "Step 1", "weight": 1.0, "step_order": 1, "description": ""}],
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Script B",
            "is_mandatory": True,
            "context_description": None,
            "steps": [{"id": script2_step_id, "name": "Step A", "weight": 1.0, "step_order": 1, "description": ""}],
        },
    ]

    script_resp = json.dumps({
        "step_scores": [{"step_id": script1_step_id, "step_name": "Step 1", "score": 82.0, "detected": True, "evidence": ""}],
        "violations": [],
    })
    script_resp2 = json.dumps({
        "step_scores": [{"step_id": script2_step_id, "step_name": "Step A", "score": 70.0, "detected": True, "evidence": ""}],
        "violations": [],
    })

    call_idx = [0]
    async def llm_side_effect(**kwargs):
        idx = call_idx[0]
        call_idx[0] += 1
        content = kwargs.get("messages", [{}])[0].get("content", "")
        if "outcome" in content or "sentiment_avg" in content:
            return make_llm_response(GOOD_GENERAL_RESPONSE)
        if idx == 0:
            return make_llm_response(script_resp)
        return make_llm_response(script_resp2)

    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(side_effect=llm_side_effect)

    msg = _make_message(payload)

    with (
        patch("worker.analyze_worker._fetch_transcript", AsyncMock(return_value=SAMPLE_SEGMENTS)),
        patch("worker.analyze_worker._fetch_scripts", AsyncMock(return_value=two_scripts)),
        patch("worker.analyze_worker.publish", AsyncMock()),
    ):
        await process_analyze_message(msg, db_session, mock_llm)

    result = await db_session.execute(
        select(Conversation).where(Conversation.recording_id == uuid.UUID(rec_id))
    )
    conv = result.scalar_one_or_none()
    assert conv is not None
    assert len(conv.script_results) == 2


@pytest.mark.asyncio
async def test_worker_overall_score_average(db_session):
    """AN-I-02: overall_score = average of two script_scores"""
    from worker.analyze_worker import process_analyze_message

    rec_id = str(uuid.uuid4())
    payload = {
        "recording_id": rec_id,
        "transcript_id": str(uuid.uuid4()),
        "seller_id": SELLER_ID,
        "store_id": STORE_ID,
        "organization_id": ORG_ID,
    }

    step_id_1 = str(uuid.uuid4())
    step_id_2 = str(uuid.uuid4())
    two_scripts = [
        {
            "id": str(uuid.uuid4()),
            "name": "Script 1",
            "is_mandatory": True,
            "context_description": None,
            "steps": [{"id": step_id_1, "name": "S1", "weight": 1.0, "step_order": 1, "description": ""}],
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Script 2",
            "is_mandatory": True,
            "context_description": None,
            "steps": [{"id": step_id_2, "name": "S2", "weight": 1.0, "step_order": 1, "description": ""}],
        },
    ]

    resp1 = json.dumps({
        "step_scores": [{"step_id": step_id_1, "step_name": "S1", "score": 82.0, "detected": True, "evidence": ""}],
        "violations": [],
    })
    resp2 = json.dumps({
        "step_scores": [{"step_id": step_id_2, "step_name": "S2", "score": 70.0, "detected": True, "evidence": ""}],
        "violations": [],
    })

    responses = [resp1, resp2]
    call_idx = [0]

    async def llm_side_effect(**kwargs):
        content = kwargs.get("messages", [{}])[0].get("content", "")
        if "sentiment_avg" in content or "outcome" in content:
            return make_llm_response(GOOD_GENERAL_RESPONSE)
        idx = call_idx[0]
        call_idx[0] += 1
        return make_llm_response(responses[idx % 2])

    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(side_effect=llm_side_effect)

    with (
        patch("worker.analyze_worker._fetch_transcript", AsyncMock(return_value=SAMPLE_SEGMENTS)),
        patch("worker.analyze_worker._fetch_scripts", AsyncMock(return_value=two_scripts)),
        patch("worker.analyze_worker.publish", AsyncMock()),
    ):
        await process_analyze_message(_make_message(payload), db_session, mock_llm)

    result = await db_session.execute(
        select(Conversation).where(Conversation.recording_id == uuid.UUID(rec_id))
    )
    conv = result.scalar_one()
    # overall = (82 + 70) / 2 = 76.0
    assert float(conv.overall_score) == 76.0


@pytest.mark.asyncio
async def test_worker_no_scripts(db_session):
    """AN-I-03: no scripts → overall_score=NULL"""
    from worker.analyze_worker import process_analyze_message

    rec_id = str(uuid.uuid4())
    payload = {
        "recording_id": rec_id,
        "transcript_id": str(uuid.uuid4()),
        "seller_id": SELLER_ID,
        "store_id": STORE_ID,
        "organization_id": ORG_ID,
    }

    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(return_value=make_llm_response(GOOD_GENERAL_RESPONSE))

    with (
        patch("worker.analyze_worker._fetch_transcript", AsyncMock(return_value=SAMPLE_SEGMENTS)),
        patch("worker.analyze_worker._fetch_scripts", AsyncMock(return_value=[])),
        patch("worker.analyze_worker.publish", AsyncMock()),
    ):
        await process_analyze_message(_make_message(payload), db_session, mock_llm)

    result = await db_session.execute(
        select(Conversation).where(Conversation.recording_id == uuid.UUID(rec_id))
    )
    conv = result.scalar_one()
    assert conv.overall_score is None
    assert len(conv.script_results) == 0


@pytest.mark.asyncio
async def test_worker_parse_error_continues(db_session):
    """AN-I-04: parse error for one script → others processed, message ACKed"""
    from worker.analyze_worker import process_analyze_message

    rec_id = str(uuid.uuid4())
    payload = {
        "recording_id": rec_id,
        "transcript_id": str(uuid.uuid4()),
        "seller_id": SELLER_ID,
        "store_id": STORE_ID,
        "organization_id": ORG_ID,
    }

    step_id = str(uuid.uuid4())
    scripts = [
        {
            "id": str(uuid.uuid4()),
            "name": "Good Script",
            "is_mandatory": True,
            "context_description": None,
            "steps": [{"id": step_id, "name": "Step", "weight": 1.0, "step_order": 1, "description": ""}],
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Bad Script",
            "is_mandatory": True,
            "context_description": None,
            "steps": [{"id": str(uuid.uuid4()), "name": "Step", "weight": 1.0, "step_order": 1, "description": ""}],
        },
    ]

    good_resp = json.dumps({
        "step_scores": [{"step_id": step_id, "step_name": "Step", "score": 75.0, "detected": True, "evidence": ""}],
        "violations": [],
    })

    call_idx = [0]
    async def side_effect(**kwargs):
        content = kwargs.get("messages", [{}])[0].get("content", "")
        if "sentiment_avg" in content or "outcome" in content:
            return make_llm_response(GOOD_GENERAL_RESPONSE)
        idx = call_idx[0]
        call_idx[0] += 1
        if idx == 0:
            return make_llm_response(good_resp)
        return make_llm_response("BROKEN JSON {{{{")

    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(side_effect=side_effect)

    with (
        patch("worker.analyze_worker._fetch_transcript", AsyncMock(return_value=SAMPLE_SEGMENTS)),
        patch("worker.analyze_worker._fetch_scripts", AsyncMock(return_value=scripts)),
        patch("worker.analyze_worker.publish", AsyncMock()),
    ):
        await process_analyze_message(_make_message(payload), db_session, mock_llm)

    result = await db_session.execute(
        select(Conversation).where(Conversation.recording_id == uuid.UUID(rec_id))
    )
    conv = result.scalar_one_or_none()
    assert conv is not None
    assert len(conv.script_results) == 2


@pytest.mark.asyncio
async def test_worker_nack_on_transcript_error(db_session):
    """AN-I-05: transcription-service unavailable → exception raised (NACK)"""
    import httpx
    from worker.analyze_worker import process_analyze_message

    payload = {
        "recording_id": str(uuid.uuid4()),
        "transcript_id": str(uuid.uuid4()),
        "seller_id": SELLER_ID,
        "store_id": STORE_ID,
        "organization_id": ORG_ID,
    }

    mock_llm = MagicMock()

    with (
        patch("worker.analyze_worker._fetch_transcript", AsyncMock(side_effect=httpx.HTTPError("connection refused"))),
        patch("worker.analyze_worker._fetch_scripts", AsyncMock(return_value=SAMPLE_SCRIPTS)),
        patch("worker.analyze_worker.publish", AsyncMock()),
    ):
        with pytest.raises(httpx.HTTPError):
            await process_analyze_message(_make_message(payload), db_session, mock_llm)


@pytest.mark.asyncio
async def test_worker_publishes_cache_invalidate(db_session):
    """AN-I-07: worker publishes queue.cache.invalidate after success"""
    from worker.analyze_worker import process_analyze_message

    rec_id = str(uuid.uuid4())
    step_id = SAMPLE_SCRIPTS[0]["steps"][0]["id"]
    payload = {
        "recording_id": rec_id,
        "transcript_id": str(uuid.uuid4()),
        "seller_id": SELLER_ID,
        "store_id": STORE_ID,
        "organization_id": ORG_ID,
    }

    script_resp = json.dumps({
        "step_scores": [
            {"step_id": step_id, "step_name": "Приветствие", "score": 80.0, "detected": True, "evidence": ""},
            {"step_id": SAMPLE_SCRIPTS[0]["steps"][1]["id"], "step_name": "Закрытие", "score": 60.0, "detected": True, "evidence": ""},
        ],
        "violations": [],
    })

    async def llm_side_effect(**kwargs):
        content = kwargs.get("messages", [{}])[0].get("content", "")
        if "sentiment_avg" in content or "outcome" in content:
            return make_llm_response(GOOD_GENERAL_RESPONSE)
        return make_llm_response(script_resp)

    mock_llm = MagicMock()
    mock_llm.chat.completions.create = AsyncMock(side_effect=llm_side_effect)

    mock_publish = AsyncMock()
    with (
        patch("worker.analyze_worker._fetch_transcript", AsyncMock(return_value=SAMPLE_SEGMENTS)),
        patch("worker.analyze_worker._fetch_scripts", AsyncMock(return_value=SAMPLE_SCRIPTS)),
        patch("worker.analyze_worker.publish", mock_publish),
    ):
        await process_analyze_message(_make_message(payload), db_session, mock_llm)

    mock_publish.assert_called_once_with(
        "queue.cache.invalidate",
        {"store_id": STORE_ID, "organization_id": ORG_ID},
    )


@pytest.mark.asyncio
async def test_get_conversation_other_org(client, other_org_client, db_session):
    """AN-I-09: GET /conversations/{id} for another org → 404"""
    from app.models import Conversation
    from datetime import date

    conv = Conversation(
        recording_id=uuid.uuid4(),
        transcript_id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_ID),
        store_id=uuid.UUID(STORE_ID),
        seller_id=uuid.UUID(SELLER_ID),
        session_date=date.today(),
        outcome="unknown",
    )
    db_session.add(conv)
    await db_session.commit()

    resp = await other_org_client.get(f"/api/v1/analytics/conversations/{conv.id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_conversation_with_scripts(client, db_session):
    """AN-I-08: GET /conversations/{id} returns script_results"""
    from app.models import Conversation, ConversationScriptResult
    from datetime import date

    conv = Conversation(
        recording_id=uuid.uuid4(),
        transcript_id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_ID),
        store_id=uuid.UUID(STORE_ID),
        seller_id=uuid.UUID(SELLER_ID),
        session_date=date.today(),
        outcome="purchase",
        overall_score=80.0,
    )
    db_session.add(conv)
    await db_session.flush()

    sr = ConversationScriptResult(
        conversation_id=conv.id,
        script_template_id=uuid.uuid4(),
        script_name="Test Script",
        was_applied=True,
        script_score=80.0,
        violations=[],
    )
    db_session.add(sr)
    await db_session.commit()

    resp = await client.get(f"/api/v1/analytics/conversations/{conv.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["script_results"]) == 1
    assert data["script_results"][0]["script_name"] == "Test Script"
