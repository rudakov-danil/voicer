import asyncio
import json
import logging
import uuid
from datetime import date, datetime

import aio_pika
import httpx
from openai import APIStatusError
from sqlalchemy import text, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.llm_client import get_llm_client
from app.models import (
    Conversation, ConversationScriptResult, ConversationScore, Objection,
    ConversationComplianceViolation,
)
from app.prompt_builder import (
    build_script_prompt,
    build_fulltext_script_prompt,
    build_general_prompt,
    build_general_compliance_prompt,
    build_redaction_prompt,
    build_upsell_prompt,
    build_crosssell_prompt,
    build_compliance_prompt,
    screen_contextual_script,
)
from app.dynamics import compute_dynamics
from app.rabbitmq import publish
from app.response_parser import (
    parse_script_scoring_response,
    parse_fulltext_scoring_response,
    parse_general_analysis_response,
    parse_redaction_response,
    parse_upsell_response,
    parse_compliance_response,
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


async def _fetch_upsell_rules(organization_id: str, store_id: str, seller_id: str | None = None) -> list[dict]:
    """Активные правила апсейла, релевантные для магазина и продавца: правила,
    покрывающие магазин (или дефолты организации) И применимые к продавцу."""
    params = {"store_id": store_id, "organization_id": organization_id, "include_org_default": "true"}
    if seller_id:
        params["seller_id"] = seller_id
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/upsell-rules",
                params=params,
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch upsell rules for org=%s store=%s: %s", organization_id, store_id, e)
            return []
    return [r for r in resp.json().get("items", []) if r.get("is_active")]


async def _fetch_compliance_rules(organization_id: str) -> list[dict]:
    """Активные правила коммуникации (комплаенс) уровня организации."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/compliance-rules",
                params={"organization_id": organization_id, "only_active": "true"},
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch compliance rules for org=%s: %s", organization_id, e)
            return []
    return resp.json().get("items", [])


async def _fetch_objection_types(organization_id: str) -> list[dict]:
    """Активные типы возражений организации (настраиваемый справочник).
    Пустой список → промпт остаётся со стандартными 7 типами."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/objection-types",
                params={"organization_id": organization_id, "only_active": "true"},
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch objection types for org=%s: %s", organization_id, e)
            return []
    return resp.json().get("items", [])


def _normalize_objection_types(objections: list[dict], objection_types: list[dict]) -> list[dict]:
    """Приводит коды типов от LLM к справочнику организации: неизвестный код
    не теряем — обрезаем до длины колонки и логируем."""
    allowed = {t["code"] for t in objection_types if t.get("code")}
    if not allowed:
        return objections
    for obj in objections:
        code = (obj.get("type") or "").strip()
        if code not in allowed:
            logger.warning("LLM returned unknown objection type %r (allowed: %s)", code, sorted(allowed))
        obj["type"] = code[:30] or "unknown"
    return objections


async def _fetch_crosssell_rules(organization_id: str, store_id: str, seller_id: str | None = None) -> list[dict]:
    """Активные правила кросс-сейла. Симметрично _fetch_upsell_rules."""
    params = {"store_id": store_id, "organization_id": organization_id, "include_org_default": "true"}
    if seller_id:
        params["seller_id"] = seller_id
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{settings.SCRIPTS_SERVICE_URL}/api/v1/scripts/cross-sell-rules",
                params=params,
                headers={"X-Internal-Key": settings.INTERNAL_SERVICE_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch cross-sell rules for org=%s store=%s: %s", organization_id, store_id, e)
            return []
    return [r for r in resp.json().get("items", []) if r.get("is_active")]


async def _fetch_call_context(db: AsyncSession, recording_id: str) -> dict | None:
    """Метаданные звонка из recorder.recordings (source, направление, номер клиента).

    Для записей с бейджей возвращает dict с source='badge' — телефонийная логика
    (исходы звонков) для них не включается. None — только при ошибке чтения.
    """
    try:
        row = (await db.execute(text("""
            SELECT source, call_direction, client_phone
            FROM recorder.recordings WHERE id = :rec_id
        """), {"rec_id": uuid.UUID(recording_id)})).fetchone()
    except Exception as e:
        logger.warning("Failed to read call context for %s: %s", recording_id, e)
        return None
    if row is None:
        return None
    return {
        "source": row.source or "badge",
        "call_direction": row.call_direction,
        "client_phone": row.client_phone,
    }


STATUS_BLOCK_SCORE = {"spoken": 100.0, "paraphrased": 70.0, "missed": 0.0}
# Статусы блока fulltext-скрипта:
#   spoken        — произнесён близко к тексту (100)
#   paraphrased   — передан своими словами (70)
#   missed        — должен был прозвучать, но не прозвучал (0) — реальный провал
#   not_applicable — ситуация не возникла (клиент не возразил/тема не поднималась),
#                    блок корректно не нужен → ИСКЛЮЧАЕТСЯ из балла полностью
SCORED_STATUSES = set(STATUS_BLOCK_SCORE)


async def _score_fulltext_script(segments: list[dict], script: dict, llm_client) -> dict:
    """Оценка покрытия полнотекстового скрипта (script_type=fulltext).

    Балл скрипта = среднее по блокам, которые реально требовались в разговоре
    (spoken=100, paraphrased=70, missed=0). Блоки со статусом not_applicable —
    ситуация для них не возникла — в балл НЕ входят (иначе ситуативные блоки,
    которые клиент не затронул, занижали бы средний балл и тепловую карту).
    Обязательные блоки (is_mandatory) требуются всегда: not_applicable для них
    не допускается и трактуется как missed.
    """
    system, user = build_fulltext_script_prompt(segments, script)
    blocks_by_id = {str(b["id"]): b for b in script.get("blocks", [])}
    # Лимит токенов масштабируем по числу блоков: ~280 токенов на блок (block_id +
    # status + короткая цитата + комментарий) + запас. Иначе ответ обрывается на
    # середине JSON и весь скрипт уходит в 0.
    fulltext_max_tokens = min(
        settings.LLM_FULLTEXT_MAX_TOKENS,
        max(settings.LLM_MAX_TOKENS, 280 * len(blocks_by_id) + 500),
    )
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=fulltext_max_tokens,
            response_format={"type": "json_object"},
            timeout=settings.LLM_SCRIPT_TIMEOUT,
        )
        parsed = parse_fulltext_scoring_response(response.choices[0].message.content)
    except LLMResponseParseError as e:
        logger.error("LLM parse error for fulltext script %s: %s", script["id"], e)
        return {
            "script_id": script["id"], "script_name": script["name"],
            "script_score": 0.0, "step_scores": [], "violations": ["LLM_PARSE_ERROR"],
            "block_results": [], "error": True,
        }
    except APIStatusError as e:
        if e.status_code < 500:
            logger.error("LLM API %d error for fulltext script %s: %s", e.status_code, script["id"], e.message)
            return {
                "script_id": script["id"], "script_name": script["name"],
                "script_score": 0.0, "step_scores": [], "violations": [f"LLM_API_ERROR_{e.status_code}"],
                "block_results": [], "error": True,
            }
        raise

    block_results: list[dict] = []
    scored: list[float] = []  # баллы блоков, которые реально требовались
    violations: list[str] = []
    seen_ids: set[str] = set()

    def _record(block: dict, status: str, quote: str, comment: str) -> None:
        is_mandatory = bool(block.get("is_mandatory", True))
        title = block.get("title") or f"Блок {block.get('block_order', '')}"
        # Обязательный блок не может быть «неприменимым» — он требуется всегда
        if status == "not_applicable" and is_mandatory:
            status = "missed"
        block_results.append({
            "block_id": str(block["id"]),
            "title": title,
            "block_order": block.get("block_order", 0),
            "is_mandatory": is_mandatory,
            "status": status,
            "quote": quote,
            "comment": comment,
        })
        if status in SCORED_STATUSES:
            scored.append(STATUS_BLOCK_SCORE[status])
            if status == "missed":
                # Пропуск обязательного блока или необработанная возникшая ситуация
                violations.append(f"Пропущен блок «{title}»")

    for br in parsed.blocks:
        block = blocks_by_id.get(br.block_id)
        if block is None or br.block_id in seen_ids:
            continue
        seen_ids.add(br.block_id)
        _record(block, br.status, br.quote, br.comment)

    # Блоки, которые LLM не вернул: обязательные — пропущены, ситуативные — считаем
    # неприменимыми (нет данных, что ситуация возникла → не штрафуем).
    for bid, block in blocks_by_id.items():
        if bid in seen_ids:
            continue
        is_mandatory = bool(block.get("is_mandatory", True))
        _record(block, "missed" if is_mandatory else "not_applicable", "", "не оценён LLM")

    block_results.sort(key=lambda b: b["block_order"])
    # Если ни один блок не требовался (все ситуативные и ни один не сработал) —
    # скрипт к этому разговору неприменим, балл не выставляем (None).
    script_score = round(sum(scored) / len(scored), 2) if scored else None

    return {
        "script_id": script["id"],
        "script_name": script["name"],
        "script_score": script_score,
        "step_scores": [],
        "violations": violations,
        "block_results": block_results,
        "error": False,
    }


async def _score_one_script(segments: list[dict], script: dict, llm_client) -> dict:
    """Score a single script. Returns dict with script_id, script_score, step_scores, violations."""
    if script.get("script_type") == "fulltext":
        return await _score_fulltext_script(segments, script, llm_client)
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


async def _general_analysis(
    segments: list[dict], llm_client, call_context: dict | None = None,
    objection_types: list[dict] | None = None,
) -> dict:
    system, user = build_general_prompt(segments, call_context, objection_types)
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


async def _check_compliance(
    segments: list[dict],
    rules: list[dict],
    llm_client,
) -> list[dict]:
    """Проверяет соблюдение правил коммуникации (комплаенс) через LLM.

    Возвращает список нарушений [{rule_id, rule_title, severity, evidence, explanation}].
    Пустой список — нарушений нет либо LLM упал.
    """
    if not rules:
        return []

    system, user = build_compliance_prompt(segments, rules)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.0,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_GENERAL_TIMEOUT,
        )
        parsed = parse_compliance_response(response.choices[0].message.content)
    except Exception as e:
        logger.error("Compliance check failed: %s", e)
        return []

    return _map_compliance_violations(parsed, rules)


def _map_compliance_violations(parsed, rules: list[dict]) -> list[dict]:
    """Сопоставляет распарсенные нарушения с правилами → список для БД.
    Общий helper для раздельного и объединённого (general+compliance) путей."""
    rules_by_id = {str(r["id"]): r for r in rules}
    out: list[dict] = []
    for v in parsed.violations:
        rule = rules_by_id.get(v.rule_id)
        if not rule:
            continue
        out.append({
            "rule_id": v.rule_id,
            "rule_title": rule.get("title", ""),
            "severity": rule.get("severity", "medium"),
            "evidence": (v.evidence or "").strip(),
            "explanation": (v.explanation or "").strip(),
        })
    return out


async def _general_and_compliance(
    segments: list[dict],
    compliance_rules: list[dict],
    llm_client,
    call_context: dict | None = None,
    objection_types: list[dict] | None = None,
) -> tuple[dict, list[dict]]:
    """Объединённый проход: общий анализ + комплаенс ОДНИМ вызовом LLM.

    Экономит токены — транскрипт пересылается один раз вместо двух. Спроектирован на
    максимальную стабильность: при любом сбое объединённого вызова прозрачно
    откатывается на проверенные раздельные вызовы (_general_analysis / _check_compliance),
    которые сами по себе деградируют в дефолты и никогда не валят анализ.

    Возвращает (general_dict, compliance_violations_list).
    """
    # Слияние выключено или комплаенс-правил нет (тогда комплаенс-вызова и так не было) →
    # обычный путь: один вызов общего анализа.
    if not settings.LLM_MERGE_ANALYSIS or not compliance_rules:
        general = await _general_analysis(segments, llm_client, call_context, objection_types)
        compliance = await _check_compliance(segments, compliance_rules, llm_client)
        return general, compliance

    try:
        system, user = build_general_compliance_prompt(segments, compliance_rules, call_context, objection_types)
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            response_format={"type": "json_object"},
            timeout=settings.LLM_GENERAL_TIMEOUT,
        )
        data = json.loads(response.choices[0].message.content)
        if not isinstance(data, dict) or "general" not in data:
            raise LLMResponseParseError("merged response missing 'general' key")
        # general — критическая секция (итог/тональность). Парсим строго.
        gen_parsed = parse_general_analysis_response(
            json.dumps(data["general"], ensure_ascii=False)
        )
        general = {
            "outcome": gen_parsed.outcome,
            "outcome_confidence": gen_parsed.outcome_confidence,
            "topic": gen_parsed.topic,
            "sentiment_avg": gen_parsed.sentiment_avg,
            "objections": [o.model_dump() for o in gen_parsed.objections],
        }
    except Exception as e:
        # general не распарсился → полный откат на раздельные проверенные вызовы.
        logger.warning(
            "Merged general+compliance failed (%s); falling back to separate calls", e
        )
        general = await _general_analysis(segments, llm_client, call_context, objection_types)
        compliance = await _check_compliance(segments, compliance_rules, llm_client)
        return general, compliance

    # general получен. Комплаенс — мягкая секция: если битая, не теряем аудит —
    # добираем отдельным вызовом, а не молча отдаём пустой список.
    try:
        comp_section = data.get("compliance") or {"violations": []}
        parsed_comp = parse_compliance_response(json.dumps(comp_section, ensure_ascii=False))
        compliance = _map_compliance_violations(parsed_comp, compliance_rules)
    except Exception as e:
        logger.warning(
            "Merged compliance section invalid (%s); re-running compliance separately", e
        )
        compliance = await _check_compliance(segments, compliance_rules, llm_client)
    return general, compliance


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
            model=settings.LLM_CHEAP_MODEL or settings.LLM_MODEL_NAME,
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

        # Step 1: Fetch transcript, scripts, upsell + crosssell + compliance rules in parallel
        try:
            segments, scripts, upsell_rules, crosssell_rules, compliance_rules, objection_types = await asyncio.gather(
                _fetch_transcript(recording_id),
                _fetch_scripts(seller_id, organization_id, store_id),
                _fetch_upsell_rules(organization_id, store_id, seller_id),
                _fetch_crosssell_rules(organization_id, store_id, seller_id),
                _fetch_compliance_rules(organization_id),
                _fetch_objection_types(organization_id),
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

        # Step 1.5: Контекст звонка (телефония) + метрики динамики из таймкодов
        call_context = await _fetch_call_context(db, recording_id)
        dynamics = compute_dynamics(segments)

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

        # Step 4: Score applied scripts + (общий анализ ⊕ комплаенс) параллельно.
        # Общий анализ и комплаенс объединены в один LLM-проход (_general_and_compliance):
        # транскрипт не пересылается дважды. Внутри — безопасный откат на раздельные вызовы.
        scripts_to_score = mandatory_scripts + applied_contextual
        scoring_coros = [
            _score_one_script(segments, script, llm_client)
            for script in scripts_to_score
        ]
        gen_comp_coro = _general_and_compliance(
            segments, compliance_rules, llm_client, call_context, objection_types
        )

        if scoring_coros:
            scored_results, (general, compliance_violations) = await asyncio.gather(
                _run_parallel_with_limit(scoring_coros, settings.LLM_MAX_PARALLEL_SCRIPTS),
                gen_comp_coro,
            )
        else:
            scored_results = []
            general, compliance_violations = await gen_comp_coro

        # Step 4.5: Нормализуем коды типов возражений против справочника организации
        general["objections"] = _normalize_objection_types(
            general.get("objections", []), objection_types
        )

        # Step 5: Calculate overall score (only from applied scripts).
        # script_score=None — fulltext-скрипт, ни один блок которого не потребовался
        # в этом разговоре: в средний балл не входит.
        applied_scores = [r["script_score"] for r in scored_results if r["script_score"] is not None]
        overall_score = calculate_overall_score(applied_scores)

        # Step 5.1: Upsell + cross-sell checks параллельно — независимые LLM-проходы.
        has_upsell_task = _check_sell(segments, upsell_rules, llm_client, kind="upsell")
        has_crosssell_task = _check_sell(segments, crosssell_rules, llm_client, kind="crosssell")
        (
            (has_upsell, upsell_details),
            (has_crosssell, crosssell_details),
        ) = await asyncio.gather(has_upsell_task, has_crosssell_task)

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

            # 2) Собираем все evidence + raw_text + compliance evidence одним батчем, редактируем
            evidence_items: list[tuple[dict, str]] = []  # (step_score_obj, evidence)
            objection_items: list[dict] = list(general.get("objections", []))

            for result in scored_results:
                for ss in result["step_scores"]:
                    if ss.evidence:
                        evidence_items.append((ss, ss.evidence))

            quotes = (
                [ev for _, ev in evidence_items]
                + [o.get("raw_text", "") for o in objection_items]
                + [cv.get("evidence", "") for cv in compliance_violations]
            )
            if quotes:
                try:
                    redacted_quotes = await _redact_texts(quotes, llm_client)
                    n_ev = len(evidence_items)
                    n_obj = len(objection_items)
                    for (ss, _), new_text in zip(evidence_items, redacted_quotes[:n_ev]):
                        ss.evidence = new_text
                    for obj, new_text in zip(objection_items, redacted_quotes[n_ev:n_ev + n_obj]):
                        obj["raw_text"] = new_text
                    for cv, new_text in zip(compliance_violations, redacted_quotes[n_ev + n_obj:]):
                        cv["evidence"] = new_text
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
            talk_ratio=dynamics["talk_ratio"],
            interruptions_count=dynamics["interruptions_count"],
            longest_monologue_seconds=dynamics["longest_monologue_seconds"],
            silence_ratio=dynamics["silence_ratio"],
        )
        # Идемпотентность: при повторном анализе сносим прежний результат по этой записи.
        # FK с ondelete=CASCADE убирают дочерние script_results / scores / objections / violations.
        await db.execute(delete(Conversation).where(Conversation.recording_id == uuid.UUID(recording_id)))
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
                block_results=result.get("block_results") or None,
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

        # Compliance violations
        for i, cv in enumerate(compliance_violations):
            try:
                rule_uuid = uuid.UUID(cv["rule_id"])
            except (KeyError, ValueError):
                logger.warning("Skipping compliance violation with bad rule_id: %r", cv)
                continue
            db.add(ConversationComplianceViolation(
                conversation_id=conv.id,
                rule_id=rule_uuid,
                rule_title=cv.get("rule_title", "")[:255],
                severity=cv.get("severity", "medium"),
                evidence=cv.get("evidence", ""),
                explanation=cv.get("explanation", ""),
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
