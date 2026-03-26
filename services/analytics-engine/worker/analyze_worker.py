import asyncio
import json
import logging
import uuid
from datetime import date, datetime

import aio_pika
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.llm_client import get_llm_client
from app.models import Conversation, ConversationScriptResult, ConversationScore, Objection
from app.prompt_builder import build_script_prompt, build_general_prompt, screen_contextual_script
from app.rabbitmq import publish
from app.response_parser import (
    parse_script_scoring_response,
    parse_general_analysis_response,
    LLMResponseParseError,
)
from app.scorer import calculate_script_score, calculate_overall_score

logger = logging.getLogger(__name__)


async def _fetch_transcript(recording_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.TRANSCRIPTION_SERVICE_URL}/api/v1/transcription/transcripts/{recording_id}",
            headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("segments", [])


async def _fetch_scripts(seller_id: str, organization_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/for-seller",
            params={"seller_id": seller_id, "organization_id": organization_id},
            headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
        )
        resp.raise_for_status()
        return resp.json().get("scripts", [])


async def _score_one_script(segments: list[dict], script: dict, llm_client) -> dict:
    """Score a single script. Returns dict with script_id, script_score, step_scores, violations."""
    system, user = build_script_prompt(segments, script)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_SCRIPT_TIMEOUT,
        )
        parsed = parse_script_scoring_response(response.choices[0].message.content)
        step_scores = [{"step_id": s.step_id, "score": s.score} for s in parsed.step_scores]
        score = calculate_script_score(step_scores, script["steps"])
        return {
            "script_id": script["id"],
            "script_name": script["name"],
            "script_score": score,
            "step_scores": parsed.step_scores,
            "violations": parsed.violations,
            "error": False,
        }
    except LLMResponseParseError as e:
        logger.error("LLM parse error for script %s: %s", script["id"], e)
        return {
            "script_id": script["id"],
            "script_name": script["name"],
            "script_score": 0.0,
            "step_scores": [],
            "violations": ["LLM_PARSE_ERROR"],
            "error": True,
        }


async def _general_analysis(segments: list[dict], llm_client) -> dict:
    system, user = build_general_prompt(segments)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_GENERAL_TIMEOUT,
        )
        parsed = parse_general_analysis_response(response.choices[0].message.content)
        return {
            "outcome": parsed.outcome,
            "outcome_confidence": parsed.outcome_confidence,
            "topic": parsed.topic,
            "sentiment_avg": parsed.sentiment_avg,
            "objections": [o.model_dump() for o in parsed.objections],
        }
    except (LLMResponseParseError, Exception) as e:
        logger.error("General analysis failed: %s", e)
        return {
            "outcome": "unknown",
            "outcome_confidence": 0.0,
            "topic": None,
            "sentiment_avg": 0.0,
            "objections": [],
        }


async def _run_parallel_with_limit(coros, limit: int):
    """Run coroutines with concurrency limit."""
    semaphore = asyncio.Semaphore(limit)

    async def bounded(coro):
        async with semaphore:
            return await coro

    return await asyncio.gather(*[bounded(c) for c in coros])


async def process_analyze_message(
    message: aio_pika.IncomingMessage,
    db: AsyncSession,
    llm_client,
):
    async with message.process(requeue=True):
        try:
            payload = json.loads(message.body)
            recording_id = payload["recording_id"]
            transcript_id = payload["transcript_id"]
            seller_id = payload["seller_id"]
            store_id = payload["store_id"]
            organization_id = payload["organization_id"]
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Invalid message format: %s", e)
            return  # ACK bad message, don't retry

        # Step 1: Fetch transcript and scripts in parallel
        try:
            segments, scripts = await asyncio.gather(
                _fetch_transcript(recording_id),
                _fetch_scripts(seller_id, organization_id),
            )
        except httpx.HTTPError as e:
            logger.error("Failed to fetch data: %s", e)
            raise  # Will NACK and requeue

        # Step 2: Split mandatory vs contextual
        mandatory_scripts = [s for s in scripts if s.get("is_mandatory")]
        contextual_scripts = [s for s in scripts if not s.get("is_mandatory")]

        # Step 3: Screen contextual scripts
        screening_coros = [
            screen_contextual_script(segments, script, llm_client)
            for script in contextual_scripts
        ]
        screening_results = await _run_parallel_with_limit(
            screening_coros, settings.LLM_MAX_PARALLEL_SCRIPTS
        )

        applied_contextual = []
        skipped_contextual = []
        for script, (applicable, reason) in zip(contextual_scripts, screening_results):
            if applicable:
                applied_contextual.append(script)
            else:
                skipped_contextual.append((script, reason))

        # Step 4: Score applied scripts + general analysis in parallel
        scripts_to_score = mandatory_scripts + applied_contextual
        scoring_coros = [
            _score_one_script(segments, script, llm_client)
            for script in scripts_to_score
        ]
        general_coro = _general_analysis(segments, llm_client)

        if scoring_coros:
            scored_results, general = await asyncio.gather(
                _run_parallel_with_limit(scoring_coros, settings.LLM_MAX_PARALLEL_SCRIPTS),
                general_coro,
            )
        else:
            scored_results = []
            general = await general_coro

        # Step 5: Calculate overall score (only from applied scripts)
        applied_scores = [r["script_score"] for r in scored_results]
        overall_score = calculate_overall_score(applied_scores)

        # Step 6: Save to DB in one transaction
        # Determine session_date from transcript or use today
        session_date_val = date.today()

        conv = Conversation(
            recording_id=uuid.UUID(recording_id),
            transcript_id=uuid.UUID(transcript_id),
            organization_id=uuid.UUID(organization_id),
            store_id=uuid.UUID(store_id),
            seller_id=uuid.UUID(seller_id),
            session_date=session_date_val,
            overall_score=overall_score,
            outcome=general["outcome"],
            outcome_confidence=general["outcome_confidence"],
            topic=general["topic"],
            sentiment_avg=general["sentiment_avg"],
            analyzed_at=datetime.utcnow(),
            llm_model=settings.LLM_MODEL_NAME,
        )
        db.add(conv)
        await db.flush()

        # Applied script results
        for result in scored_results:
            sr = ConversationScriptResult(
                conversation_id=conv.id,
                script_template_id=uuid.UUID(result["script_id"]),
                script_name=result["script_name"],
                was_applied=True,
                script_score=result["script_score"],
                violations=result["violations"],
            )
            db.add(sr)

            # Step scores
            script_obj = next(
                (s for s in scripts_to_score if s["id"] == result["script_id"]), None
            )
            if script_obj:
                step_map = {s["id"]: s for s in script_obj["steps"]}
                for ss in result["step_scores"]:
                    step_info = step_map.get(ss.step_id, {})
                    cs = ConversationScore(
                        conversation_id=conv.id,
                        script_template_id=uuid.UUID(result["script_id"]),
                        script_step_id=uuid.UUID(ss.step_id),
                        step_name=ss.step_name,
                        step_weight=step_info.get("weight", 0),
                        score=ss.score,
                        evidence_text=ss.evidence or None,
                        step_detected=ss.detected,
                    )
                    db.add(cs)

        # Skipped contextual scripts
        for script, skip_reason in skipped_contextual:
            sr = ConversationScriptResult(
                conversation_id=conv.id,
                script_template_id=uuid.UUID(script["id"]),
                script_name=script["name"],
                was_applied=False,
                script_score=None,
                violations=[],
                skip_reason=skip_reason,
            )
            db.add(sr)

        # Objections
        for i, obj in enumerate(general.get("objections", [])):
            db.add(Objection(
                conversation_id=conv.id,
                type=obj["type"],
                is_resolved=obj["is_resolved"],
                resolution_technique=obj.get("resolution_technique"),
                raw_text=obj["raw_text"],
                sort_order=i,
            ))

        await db.commit()

        # Step 7: Publish cache invalidation
        await publish("queue.cache.invalidate", {
            "store_id": store_id,
            "organization_id": organization_id,
        })

        logger.info("Analyzed recording %s, overall_score=%s", recording_id, overall_score)


async def start_consuming():
    import aio_pika
    connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)
    queue = await channel.declare_queue("queue.analyze", durable=True)
    llm_client = get_llm_client()

    async def on_message(message: aio_pika.IncomingMessage):
        async with AsyncSessionLocal() as db:
            await process_analyze_message(message, db, llm_client)

    await queue.consume(on_message)
    logger.info("analyze_worker started, consuming queue.analyze")
    # Keep running
    await asyncio.Future()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(start_consuming())
