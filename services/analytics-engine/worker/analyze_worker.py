import asyncio
import json
import logging
import uuid
from datetime import date, datetime

import aio_pika
import httpx
from openai import APIStatusError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.llm_client import get_llm_client
from app.models import Conversation, ConversationScriptResult, ConversationScore, Objection
from app.prompt_builder import (
    build_script_prompt,
    build_general_prompt,
    build_redaction_prompt,
    build_upsell_prompt,
    build_crosssell_prompt,
    screen_contextual_script,
)
from app.rabbitmq import publish
from app.response_parser import (
    parse_script_scoring_response,
    parse_general_analysis_response,
    parse_redaction_response,
    parse_upsell_response,
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


async def _fetch_scripts(seller_id: str, organization_id: str, store_id: str | None = None) -> list[dict]:
    params = {"seller_id": seller_id, "organization_id": organization_id}
    if store_id:
        params["store_id"] = store_id
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/for-seller",
            params=params,
            headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
        )
        resp.raise_for_status()
        return resp.json().get("scripts", [])


async def _fetch_upsell_rules(organization_id: str, store_id: str) -> list[dict]:
    """Активные правила апсейла, релевантные для магазина: его правила + дефолты организации."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/upsell-rules",
                params={"store_id": store_id, "include_org_default": "true"},
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch upsell rules for org=%s store=%s: %s", organization_id, store_id, e)
            return []
    return [r for r in resp.json().get("items", []) if r.get("is_active")]


async def _fetch_crosssell_rules(organization_id: str, store_id: str) -> list[dict]:
    """Активные правила кросс-сейла. Симметрично _fetch_upsell_rules."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/cross-sell-rules",
                params={"store_id": store_id, "include_org_default": "true"},
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch cross-sell rules for org=%s store=%s: %s", organization_id, store_id, e)
            return []
    return [r for r in resp.json().get("items", []) if r.get("is_active")]


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
    except APIStatusError as e:
        if e.status_code < 500:
            # 4xx — не ретраить (auth, rate limit, bad request)
            logger.error(
                "LLM API %d error (non-retryable) for script %s: %s",
                e.status_code, script["id"], e.message,
            )
            return {
                "script_id": script["id"],
                "script_name": script["name"],
                "script_score": 0.0,
                "step_scores": [],
                "violations": [f"LLM_API_ERROR_{e.status_code}"],
                "error": True,
            }
        raise  # 5xx — пробрасываем, сообщение уйдёт в requeue


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


async def _check_sell(
    segments: list[dict],
    rules: list[dict],
    llm_client,
    kind: str,  # "upsell" | "crosssell"
) -> tuple[bool | None, list[dict]]:
    """Проверяет соблюдение правил апсейла/кросс-сейла через LLM.

    Возвращает (has_sell, details).
        has_sell:
            None — правил не было или LLM упал
            False — правила сработали (triggered), но продавец не предложил ничего из required
            True  — хотя бы одно правило закрыто (предложено что-то из required)
        details — список релевантных правил с разметкой offered/missed + цитатами
                  trigger_quotes / offer_quotes для подсветки в UI.
    """
    if not rules:
        return None, []

    if kind == "upsell":
        system, user = build_upsell_prompt(segments, rules)
    elif kind == "crosssell":
        system, user = build_crosssell_prompt(segments, rules)
    else:
        raise ValueError(f"Unknown sell kind: {kind}")

    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.0,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_GENERAL_TIMEOUT,
        )
        parsed = parse_upsell_response(response.choices[0].message.content)
    except Exception as e:
        logger.error("%s check failed: %s", kind, e)
        return None, []

    rules_by_id = {str(r["id"]): r for r in rules}
    details: list[dict] = []
    has_any_offered = False
    has_triggered = False
    for chk in parsed.checks:
        rule = rules_by_id.get(chk.rule_id)
        if not rule:
            continue
        if not chk.triggered:
            continue
        has_triggered = True
        required = set(rule.get("required_offers") or [])
        offered = set(chk.offered_items or []) & required
        missed = required - offered
        if offered:
            has_any_offered = True
        # Цитаты: оставляем только для офферов, которые реально были предложены, и
        # фильтруем пустые строки.
        clean_offer_quotes = {
            offer: [q for q in (chk.offer_quotes.get(offer) or []) if isinstance(q, str) and q.strip()]
            for offer in offered
        }
        clean_offer_quotes = {k: v for k, v in clean_offer_quotes.items() if v}
        details.append({
            "rule_id": chk.rule_id,
            "trigger_product": rule.get("trigger_product"),
            "required_offers": list(required),
            "offered_items": list(offered),
            "missed_items": list(missed),
            "evidence": chk.evidence,
            "trigger_quotes": [q for q in chk.trigger_quotes if isinstance(q, str) and q.strip()],
            "offer_quotes": clean_offer_quotes,
        })

    if not has_triggered:
        return None, []
    return has_any_offered, details


# Совместимость: внешний код вызывает _check_upsell — оставляем как тонкую обёртку.
async def _check_upsell(segments, rules, llm_client):
    return await _check_sell(segments, rules, llm_client, kind="upsell")


async def _check_crosssell(segments, rules, llm_client):
    return await _check_sell(segments, rules, llm_client, kind="crosssell")


async def _is_anonymization_enabled(
    db: AsyncSession, organization_id: str, store_id: str
) -> bool:
    """Читает admin_schema.privacy_settings: возвращает True, если нужно анонимизировать.
    Сначала ищет настройку для конкретного магазина, потом fallback на org-level (store_id IS NULL).
    """
    sql = text("""
        SELECT anonymize_transcripts
        FROM admin_schema.privacy_settings
        WHERE organization_id = :org_id
          AND (store_id = :store_id OR store_id IS NULL)
        ORDER BY (store_id = :store_id) DESC
        LIMIT 1
    """)
    try:
        row = (await db.execute(sql, {
            "org_id": uuid.UUID(organization_id),
            "store_id": uuid.UUID(store_id),
        })).fetchone()
    except Exception as e:
        logger.warning("Failed to read privacy_settings: %s", e)
        return False
    return bool(row.anonymize_transcripts) if row else False


async def _redact_texts(texts: list[str], llm_client) -> list[str]:
    """Редактирует список строк через LLM, заменяя ПД токенами. Возвращает массив той же длины.
    При ошибке LLM возвращает исходный массив без изменений.
    """
    non_empty_idx = [i for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty_idx:
        return list(texts)
    payload = [texts[i] for i in non_empty_idx]

    system, user = build_redaction_prompt(payload)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.0,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_SCRIPT_TIMEOUT,
        )
        redacted = parse_redaction_response(
            response.choices[0].message.content, expected_count=len(payload)
        )
    except (LLMResponseParseError, Exception) as e:
        logger.error("Redaction failed, keeping originals: %s", e)
        return list(texts)

    result = list(texts)
    for k, idx in enumerate(non_empty_idx):
        result[idx] = redacted[k]
    return result


async def _apply_redaction_to_db(
    db: AsyncSession, transcript_id: str, segments: list[dict], llm_client
) -> list[dict]:
    """Редактирует тексты сегментов и обновляет transcripts/transcript_segments в БД.
    Возвращает копию `segments` с редактированными текстами (для использования внутри воркера —
    e.g. чтобы evidence/raw_text после анализа были сопоставлены с тем, что осталось в БД).
    """
    original_texts = [seg.get("text", "") for seg in segments]
    redacted_texts = await _redact_texts(original_texts, llm_client)

    # Обновляем сегменты по segment_index (стабильный ключ при той же transcript_id)
    update_seg_sql = text("""
        UPDATE transcription.transcript_segments
        SET text = :new_text
        WHERE transcript_id = :t_id AND segment_index = :idx
    """)
    for seg, new_text in zip(segments, redacted_texts):
        seg_idx = seg.get("segment_index")
        if seg_idx is None:
            continue
        await db.execute(update_seg_sql, {
            "new_text": new_text,
            "t_id": uuid.UUID(transcript_id),
            "idx": seg_idx,
        })

    # Перестраиваем full_text из редактированных сегментов
    new_full_text = "\n".join(t for t in redacted_texts if t)
    await db.execute(
        text("UPDATE transcription.transcripts SET full_text = :ft WHERE id = :t_id"),
        {"ft": new_full_text, "t_id": uuid.UUID(transcript_id)},
    )

    return [dict(seg, text=new_text) for seg, new_text in zip(segments, redacted_texts)]


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

        # Step 1: Fetch transcript, scripts, upsell + crosssell rules in parallel
        try:
            segments, scripts, upsell_rules, crosssell_rules = await asyncio.gather(
                _fetch_transcript(recording_id),
                _fetch_scripts(seller_id, organization_id, store_id),
                _fetch_upsell_rules(organization_id, store_id),
                _fetch_crosssell_rules(organization_id, store_id),
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # Транскрипт или скрипты не найдены — постоянная ошибка, не ретраить
                logger.error(
                    "Resource not found (404) for recording %s, dropping message: %s",
                    recording_id, e.request.url,
                )
                return  # ACK — выбрасываем сообщение без повтора
            logger.error("HTTP error fetching data for recording %s: %s", recording_id, e)
            raise  # 5xx и другие — NACK, requeue
        except httpx.HTTPError as e:
            logger.error("Failed to fetch data for recording %s: %s", recording_id, e)
            raise  # Сетевые ошибки — NACK, requeue

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

        # Step 5.1: Upsell + cross-sell rule checks (по отдельному LLM-проходу для каждого).
        # Запускаем параллельно — независимые задачи.
        has_upsell_task = _check_sell(segments, upsell_rules, llm_client, kind="upsell")
        has_crosssell_task = _check_sell(segments, crosssell_rules, llm_client, kind="crosssell")
        (has_upsell, upsell_details), (has_crosssell, crosssell_details) = await asyncio.gather(
            has_upsell_task, has_crosssell_task
        )

        # Step 5.5: Anonymize transcripts if privacy setting is enabled.
        # Анализ уже отработал на оригинале (имена и т.п. помогают LLM понять контекст),
        # теперь сносим ПД из всего, что попадает в БД: сегменты, full_text, evidence, raw_text.
        anonymize = await _is_anonymization_enabled(db, organization_id, store_id)
        if anonymize:
            # 1) Сегменты транскрипта + full_text → UPDATE существующих строк
            try:
                await _apply_redaction_to_db(db, transcript_id, segments, llm_client)
            except Exception as e:
                logger.error("Transcript redaction failed for %s: %s", recording_id, e)

            # 2) Собираем все evidence + raw_text одним батчем, редактируем, раскладываем обратно
            evidence_items: list[tuple[dict, str]] = []  # (step_score_obj, evidence)
            objection_items: list[dict] = list(general.get("objections", []))

            for result in scored_results:
                for ss in result["step_scores"]:
                    if ss.evidence:
                        evidence_items.append((ss, ss.evidence))

            quotes = [ev for _, ev in evidence_items] + [o.get("raw_text", "") for o in objection_items]
            if quotes:
                try:
                    redacted_quotes = await _redact_texts(quotes, llm_client)
                    for (ss, _), new_text in zip(evidence_items, redacted_quotes[:len(evidence_items)]):
                        ss.evidence = new_text
                    for obj, new_text in zip(objection_items, redacted_quotes[len(evidence_items):]):
                        obj["raw_text"] = new_text
                    general["objections"] = objection_items
                except Exception as e:
                    logger.error("Evidence/raw_text redaction failed for %s: %s", recording_id, e)

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
            has_upsell=has_upsell,
            upsell_results=upsell_details or None,
            has_crosssell=has_crosssell,
            crosssell_results=crosssell_details or None,
        )
        db.add(conv)
        await db.flush()

        # Applied script results
        for result in scored_results:
            script_obj = next(
                (s for s in scripts_to_score if s["id"] == result["script_id"]), None
            )
            version_id_raw = (script_obj or {}).get("current_version_id")
            sr = ConversationScriptResult(
                conversation_id=conv.id,
                script_template_id=uuid.UUID(result["script_id"]),
                script_template_version_id=uuid.UUID(version_id_raw) if version_id_raw else None,
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
