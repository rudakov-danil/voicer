import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import httpx
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings
from app import fingerprint as fp
from app.routers.notifications import get_score_threshold

router = APIRouter(prefix="/api/v1/dashboard", tags=["conversations"])


async def _sell_fallback_map(db: AsyncSession, rows) -> dict:
    """Keyword-фолбэк апсейла/кросс-сейла для строк с has_upsell/has_crosssell IS NULL.

    Досчитывает флаг по ключевым словам (триггер + хотя бы один оффер в репликах
    продавца) — как в детальной карточке. Возвращает {conv_id: (upsell_kw, crosssell_kw)}.
    Требует у строк атрибуты .id, .has_upsell, .has_crosssell.
    """
    needs_fallback = [r for r in rows if r.has_upsell is None or r.has_crosssell is None]
    if not needs_fallback:
        return {}
    fb_sql = text("""
        WITH conv_seller_text AS (
            SELECT c.id AS conv_id, c.organization_id, c.store_id, c.seller_id,
                   LOWER(string_agg(ts.text, ' ')) AS seller_text
            FROM analytics.conversations c
            JOIN transcription.transcript_segments ts ON ts.transcript_id = c.transcript_id
            WHERE c.id = ANY(:conv_ids) AND LOWER(ts.speaker_role) = 'seller'
            GROUP BY c.id, c.organization_id, c.store_id, c.seller_id
        )
        SELECT
            c.conv_id,
            EXISTS(
                SELECT 1 FROM scripts.upsell_rules r
                WHERE r.organization_id = c.organization_id
                  AND r.is_active = TRUE
                  AND (cardinality(r.store_ids) = 0 OR c.store_id = ANY(r.store_ids))
                  AND (cardinality(r.seller_ids) = 0 OR c.seller_id = ANY(r.seller_ids))
                  AND POSITION(LOWER(r.trigger_product) IN c.seller_text) > 0
                  AND EXISTS (
                      SELECT 1 FROM unnest(r.required_offers) AS offer
                      WHERE POSITION(LOWER(offer) IN c.seller_text) > 0
                  )
            ) AS has_upsell_kw,
            EXISTS(
                SELECT 1 FROM scripts.cross_sell_rules r
                WHERE r.organization_id = c.organization_id
                  AND r.is_active = TRUE
                  AND (cardinality(r.store_ids) = 0 OR c.store_id = ANY(r.store_ids))
                  AND (cardinality(r.seller_ids) = 0 OR c.seller_id = ANY(r.seller_ids))
                  AND POSITION(LOWER(r.trigger_product) IN c.seller_text) > 0
                  AND EXISTS (
                      SELECT 1 FROM unnest(r.required_offers) AS offer
                      WHERE POSITION(LOWER(offer) IN c.seller_text) > 0
                  )
            ) AS has_crosssell_kw
        FROM conv_seller_text c
    """)
    fb_rows = (await db.execute(fb_sql, {"conv_ids": [r.id for r in needs_fallback]})).fetchall()
    return {fb.conv_id: (fb.has_upsell_kw, fb.has_crosssell_kw) for fb in fb_rows}


# Массив результатов допродажи (jsonb) как массив, даже если в базе null/скаляр
def _sell_array(col: str) -> str:
    return f"(CASE WHEN jsonb_typeof({col}) = 'array' THEN {col} ELSE '[]'::jsonb END)"


def _json_len(expr: str) -> str:
    return f"(CASE WHEN jsonb_typeof({expr}) = 'array' THEN jsonb_array_length({expr}) ELSE 0 END)"


# Подборки списка разговоров (вкладки над таблицей)
VIEW_CONDITIONS: dict[str, str] = {
    # То же правило, что у оповещений: нарушение комплаенса или балл ниже порога
    "attention": """(
        EXISTS(SELECT 1 FROM analytics.conversation_compliance_violations v WHERE v.conversation_id = c.id)
        OR (c.overall_score IS NOT NULL AND c.overall_score < :threshold)
    )""",
    "violations": "EXISTS(SELECT 1 FROM analytics.conversation_compliance_violations v WHERE v.conversation_id = c.id)",
    "price_open": """EXISTS(
        SELECT 1 FROM analytics.objections o
        WHERE o.conversation_id = c.id AND o.type = 'price' AND o.is_resolved IS NOT TRUE
    )""",
    "competitor": "c.outcome = 'competitor'",
    # Правила допродажи сработали, но продавец не предложил ничего из положенного («0 из N»)
    "no_upsell": f"""(
        EXISTS(
            SELECT 1 FROM jsonb_array_elements({_sell_array('c.upsell_results')} || {_sell_array('c.crosssell_results')}) e
            WHERE {_json_len("e->'required_offers'")} > 0
        )
        AND NOT EXISTS(
            SELECT 1 FROM jsonb_array_elements({_sell_array('c.upsell_results')} || {_sell_array('c.crosssell_results')}) e
            WHERE {_json_len("e->'offered_items'")} > 0
        )
    )""",
}


def _resolve_sell(row_id, db_val, idx: int, fallback_map: dict) -> bool:
    if db_val is not None:
        return db_val
    kw = fallback_map.get(row_id)
    return bool(kw[idx]) if kw else False


@router.get("/conversations")
async def list_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    outcome: str | None = None,
    score_min: float | None = None,
    score_max: float | None = None,
    direction: str | None = None,       # inbound | outbound — фильтр по направлению звонка
    source: str | None = None,          # badge | manual | transcript | call_manual | call_webhook | calls (любые звонки)
    client_phone: str | None = None,    # поиск по номеру клиента (подстрока)
    group_by_phone: bool = False,       # группировать звонки одного клиента: одна строка на номер (последний звонок), группа поднимается по свежему звонку
    view: str | None = None,            # подборка: attention | violations | price_open | competitor | no_upsell
    q: str | None = None,               # фраза из разговора (поиск по репликам транскрипта)
    with_counts: bool = False,          # вернуть размеры подборок (для вкладок)
    limit: int = Query(default=20),
    offset: int = Query(default=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    conditions = [
        "c.organization_id = :org_id",
        "c.session_date BETWEEN :date_from AND :date_to",
    ]
    params: dict = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "offset": offset,
    }

    if effective_store_id:
        conditions.append("c.store_id = :store_id")
        params["store_id"] = effective_store_id
    if seller_id:
        conditions.append("c.seller_id = :seller_id")
        params["seller_id"] = seller_id
    if outcome:
        conditions.append("c.outcome = :outcome")
        params["outcome"] = outcome
    if score_min is not None:
        conditions.append("c.overall_score >= :score_min")
        params["score_min"] = score_min
    if score_max is not None:
        conditions.append("c.overall_score <= :score_max")
        params["score_max"] = score_max
    if direction in ("inbound", "outbound"):
        conditions.append("r.call_direction = :direction")
        params["direction"] = direction
    if source == "calls":
        conditions.append("r.source IN ('call_manual', 'call_webhook')")
    elif source:
        conditions.append("r.source = :source")
        params["source"] = source
    if client_phone:
        conditions.append("r.client_phone LIKE :client_phone")
        params["client_phone"] = f"%{client_phone.strip()}%"

    q = (q or "").strip()
    if q:
        conditions.append("""EXISTS(
            SELECT 1 FROM transcription.transcript_segments ts
            WHERE ts.transcript_id = c.transcript_id AND ts.text ILIKE :q_like
        )""")
        params["q_like"] = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

    if view in VIEW_CONDITIONS or with_counts:
        params["threshold"] = await get_score_threshold(db, org_id, effective_store_id)

    # Размеры подборок считаем по базовым фильтрам — до условия самой подборки
    view_counts = None
    if with_counts:
        base_where = " AND ".join(conditions)
        counts_sql = text(f"""
            SELECT COUNT(*) AS total,
                   {", ".join(f"COUNT(*) FILTER (WHERE {cond}) AS {name}" for name, cond in VIEW_CONDITIONS.items())}
            FROM analytics.conversations c
            LEFT JOIN recorder.recordings r ON r.id = c.recording_id
            WHERE {base_where}
        """)
        counts_row = (await db.execute(counts_sql, params)).mappings().one()
        view_counts = {k: int(v or 0) for k, v in counts_row.items()}

    if view in VIEW_CONDITIONS:
        conditions.append(VIEW_CONDITIONS[view])

    where = " AND ".join(conditions)

    # Ключ группировки по клиенту: нормализованный номер (последние 10 цифр). У записей без
    # номера (розница, аудио без телефона) ключ уникален по id — они не группируются.
    group_key_expr = (
        "CASE WHEN r.client_phone IS NOT NULL "
        "AND length(regexp_replace(r.client_phone, '\\D', '', 'g')) >= 10 "
        "THEN RIGHT(regexp_replace(r.client_phone, '\\D', '', 'g'), 10) "
        "ELSE 'id:' || c.id::text END"
    )

    select_cols = """
            c.id,
            c.recording_id,
            c.seller_id,
            c.store_id,
            c.organization_id,
            c.transcript_id,
            c.session_date,
            c.overall_score,
            c.outcome,
            c.topic,
            c.analyzed_at,
            c.has_upsell,
            c.has_crosssell,
            c.is_scorable,
            c.call_category,
            c.upsell_results,
            c.crosssell_results,
            r.started_at,
            r.duration_seconds,
            r.source,
            r.call_direction,
            r.client_phone,
            s.first_name AS seller_first_name,
            s.last_name AS seller_last_name,
            st.name AS store_name,
            EXISTS(
                SELECT 1 FROM analytics.conversation_script_results csr
                WHERE csr.conversation_id = c.id AND cardinality(csr.violations) > 0
            ) AS has_violations,
            EXISTS(
                SELECT 1 FROM analytics.conversation_compliance_violations ccv
                WHERE ccv.conversation_id = c.id
            ) AS has_compliance_violations,
            (
                SELECT COUNT(*) FROM analytics.conversation_compliance_violations ccv
                WHERE ccv.conversation_id = c.id
            ) AS compliance_violations_count,
            (
                SELECT ccv.rule_title FROM analytics.conversation_compliance_violations ccv
                WHERE ccv.conversation_id = c.id
                ORDER BY (ccv.severity = 'high') DESC, ccv.sort_order
                LIMIT 1
            ) AS top_violation,
            (
                SELECT ccv.severity FROM analytics.conversation_compliance_violations ccv
                WHERE ccv.conversation_id = c.id
                ORDER BY (ccv.severity = 'high') DESC, ccv.sort_order
                LIMIT 1
            ) AS top_violation_severity,
            (
                SELECT o.type FROM analytics.objections o
                WHERE o.conversation_id = c.id AND o.is_resolved IS NOT TRUE
                ORDER BY o.sort_order
                LIMIT 1
            ) AS open_objection
    """
    base_from = f"""
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {where}
    """

    if group_by_phone:
        # Одна строка на клиента = последний звонок; группа сортируется по своему свежему
        # звонку (повторный звонок поднимает всю группу вверх). group_count — размер группы.
        count_sql = text(f"""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT {group_key_expr} AS gk
                FROM analytics.conversations c
                LEFT JOIN recorder.recordings r ON r.id = c.recording_id
                WHERE {where}
            ) t
        """)
        list_sql = text(f"""
            WITH base AS (
                SELECT {select_cols}, {group_key_expr} AS group_key
                {base_from}
            ), ranked AS (
                SELECT base.*,
                    ROW_NUMBER() OVER (PARTITION BY group_key ORDER BY session_date DESC, analyzed_at DESC) AS rn,
                    COUNT(*)     OVER (PARTITION BY group_key) AS group_count,
                    MAX(session_date) OVER (PARTITION BY group_key) AS group_last_date
                FROM base
            )
            SELECT * FROM ranked WHERE rn = 1
            ORDER BY group_last_date DESC, analyzed_at DESC
            LIMIT :limit OFFSET :offset
        """)
    else:
        count_sql = text(f"""
            SELECT COUNT(*) FROM analytics.conversations c
            LEFT JOIN recorder.recordings r ON r.id = c.recording_id
            WHERE {where}
        """)
        list_sql = text(f"""
            SELECT {select_cols}
            {base_from}
            ORDER BY c.session_date DESC, c.analyzed_at DESC
            LIMIT :limit OFFSET :offset
        """)

    total = (await db.execute(count_sql, params)).scalar_one()
    rows = (await db.execute(list_sql, params)).fetchall()

    # Где в разговоре прозвучала искомая фраза — первая подходящая реплика
    hits: dict = {}
    if q and rows:
        hit_rows = (await db.execute(text("""
            SELECT DISTINCT ON (c.id) c.id, ts.start_ms, ts.text
            FROM analytics.conversations c
            JOIN transcription.transcript_segments ts ON ts.transcript_id = c.transcript_id
            WHERE c.id = ANY(:ids) AND ts.text ILIKE :q_like
            ORDER BY c.id, ts.segment_index
        """), {"ids": [r.id for r in rows], "q_like": params["q_like"]})).fetchall()
        hits = {h.id: {"t": round((h.start_ms or 0) / 1000), "text": h.text} for h in hit_rows}

    # Keyword-фолбэк для апсейла / кросс-сейла: симметрия с детальной карточкой,
    # где analyzeSell() матчит триггер + хотя бы один offer в сегментах продавца.
    # Применяется только к разговорам с has_upsell/has_crosssell IS NULL — LLM не разметил.
    fallback_map = await _sell_fallback_map(db, rows)

    def _resolve(r, db_val, idx):
        return _resolve_sell(r.id, db_val, idx, fallback_map)

    items = [
        {
            "id": r.id,
            "recording_id": r.recording_id,
            "seller_id": r.seller_id,
            "store_id": r.store_id,
            "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            "store_name": r.store_name,
            "session_date": str(r.session_date),
            "recorded_at": r.started_at,
            "overall_score": float(r.overall_score) if r.overall_score is not None else None,
            "outcome": r.outcome,
            "topic": r.topic,
            "duration_seconds": r.duration_seconds,
            "source": r.source,
            "call_direction": r.call_direction,
            "client_phone": r.client_phone,
            "is_scorable": r.is_scorable,
            "call_category": r.call_category,
            "has_violations": r.has_violations,
            "has_compliance_violations": r.has_compliance_violations,
            "compliance_violations_count": int(r.compliance_violations_count or 0),
            "has_upsell": _resolve(r, r.has_upsell, 0),
            "has_crosssell": _resolve(r, r.has_crosssell, 1),
            # Допродажа «предложено из положенного» по сработавшим правилам: [сделано, нужно]
            "upsell": list(u) if (u := fp.upsell_score(r.upsell_results, r.crosssell_results)) else None,
            "top_violation": r.top_violation,
            "top_violation_severity": r.top_violation_severity,
            "open_objection": r.open_objection,
            "hit": hits.get(r.id),
            "analyzed_at": r.analyzed_at,
            # Сколько всего звонков в группе этого клиента (1 = без группы). Только при group_by_phone.
            "group_count": int(getattr(r, "group_count", 1) or 1),
        }
        for r in rows
    ]

    return {"items": items, "total": total, **({"view_counts": view_counts} if view_counts is not None else {})}


@router.get("/conversations/fingerprints")
async def get_fingerprints(
    ids: str = Query(..., description="id разговоров через запятую, до 100"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """«Отпечатки» разговоров для списка: реплики по дорожкам и метки событий."""
    org_id, forced_store_id = org_store_conditions(user)
    try:
        id_list = list(dict.fromkeys(uuid.UUID(x) for x in ids.split(",") if x.strip()))[:100]
    except ValueError:
        raise HTTPException(status_code=422, detail="ids must be comma-separated UUIDs")
    if not id_list:
        return {"items": {}}

    conv_sql = """
        SELECT c.id, c.transcript_id, c.upsell_results, c.crosssell_results, r.duration_seconds
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE c.id = ANY(:ids) AND c.organization_id = :org_id
    """
    params: dict = {"ids": id_list, "org_id": uuid.UUID(org_id)}
    if forced_store_id:
        conv_sql += " AND c.store_id = :store_id"
        params["store_id"] = forced_store_id
    convs = (await db.execute(text(conv_sql), params)).fetchall()
    if not convs:
        return {"items": {}}

    conv_ids = [c.id for c in convs]
    transcript_ids = [c.transcript_id for c in convs if c.transcript_id]
    segs_by_tr: dict = {}
    if transcript_ids:
        for seg in (await db.execute(text("""
            SELECT transcript_id, speaker_role, start_ms, end_ms, text
            FROM transcription.transcript_segments
            WHERE transcript_id = ANY(:tids)
            ORDER BY transcript_id, segment_index
        """), {"tids": transcript_ids})).fetchall():
            segs_by_tr.setdefault(seg.transcript_id, []).append(seg)

    objections: dict = {}
    for o in (await db.execute(text("""
        SELECT conversation_id, type, is_resolved, raw_text
        FROM analytics.objections WHERE conversation_id = ANY(:ids) ORDER BY sort_order
    """), {"ids": conv_ids})).fetchall():
        objections.setdefault(o.conversation_id, []).append(o)

    violations: dict = {}
    for v in (await db.execute(text("""
        SELECT conversation_id, rule_title, severity, evidence
        FROM analytics.conversation_compliance_violations WHERE conversation_id = ANY(:ids) ORDER BY sort_order
    """), {"ids": conv_ids})).fetchall():
        violations.setdefault(v.conversation_id, []).append(v)

    items = {}
    for c in convs:
        segments = segs_by_tr.get(c.transcript_id, [])
        segs = fp.lanes(segments)
        duration = max(float(c.duration_seconds or 0), segs[-1][1] if segs else 0.0)
        if not segs or not duration:
            continue
        items[str(c.id)] = {
            "dur": round(duration, 1),
            "segs": segs,
            "talk": fp.talk_share(segs),
            "marks": fp.marks(
                duration, segments,
                objections.get(c.id, []), violations.get(c.id, []),
                c.upsell_results, c.crosssell_results,
            ),
        }
    return {"items": items}


@router.get("/conversations/{conversation_id}/history")
async def get_client_history(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """История обращений с того же номера клиента.

    Группирует звонки по нормализованному номеру (только цифры, последние 10 —
    чтобы 8XXX / +7XXX / с пробелами считались одним клиентом). Возвращает все
    разговоры этого клиента в организации, включая текущий (флаг is_current),
    отсортированные по дате (свежие сверху). Пусто, если у записи нет номера.
    """
    org_id, forced_store_id = org_store_conditions(user)

    base_sql = text("""
        SELECT r.client_phone
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE c.id = :conv_id AND c.organization_id = :org_id
    """)
    base_row = (await db.execute(base_sql, {"conv_id": conversation_id, "org_id": uuid.UUID(org_id)})).fetchone()
    if not base_row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    phone = (base_row.client_phone or "").strip()
    norm = "".join(ch for ch in phone if ch.isdigit())[-10:]
    if len(norm) < 10:
        # Номера нет или он слишком короткий для надёжной группировки
        return {"client_phone": phone or None, "items": [], "total": 0}

    conditions = [
        "c.organization_id = :org_id",
        "RIGHT(regexp_replace(r.client_phone, '\\D', '', 'g'), 10) = :norm",
    ]
    params: dict = {"org_id": uuid.UUID(org_id), "norm": norm, "current_id": conversation_id}
    if forced_store_id:
        conditions.append("c.store_id = :store_id")
        params["store_id"] = forced_store_id
    where = " AND ".join(conditions)

    hist_sql = text(f"""
        SELECT
            c.id,
            c.session_date,
            c.analyzed_at,
            c.overall_score,
            c.outcome,
            c.topic,
            c.is_scorable,
            c.call_category,
            c.has_upsell,
            c.has_crosssell,
            r.duration_seconds,
            r.call_direction,
            r.client_phone,
            (c.id = :current_id) AS is_current,
            s.first_name AS seller_first_name,
            s.last_name AS seller_last_name,
            st.name AS store_name
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {where}
        ORDER BY c.session_date DESC, c.analyzed_at DESC
    """)
    rows = (await db.execute(hist_sql, params)).fetchall()

    # Тот же keyword-фолбэк, что и в списке: NULL-флаги досчитываем по транскрипту,
    # иначе в дочерних строках группы апсейл/кросс-сейл показывались бы как «—».
    fallback_map = await _sell_fallback_map(db, rows)

    items = [
        {
            "id": r.id,
            "session_date": str(r.session_date),
            "analyzed_at": str(r.analyzed_at) if r.analyzed_at else None,
            "overall_score": float(r.overall_score) if r.overall_score is not None else None,
            "outcome": r.outcome,
            "topic": r.topic,
            "is_scorable": r.is_scorable,
            "call_category": r.call_category,
            "has_upsell": _resolve_sell(r.id, r.has_upsell, 0, fallback_map),
            "has_crosssell": _resolve_sell(r.id, r.has_crosssell, 1, fallback_map),
            "duration_seconds": r.duration_seconds,
            "call_direction": r.call_direction,
            "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            "store_name": r.store_name,
            "is_current": bool(r.is_current),
        }
        for r in rows
    ]
    return {"client_phone": phone, "items": items, "total": len(items)}


@router.get("/conversations/{conversation_id}/day")
async def get_seller_day(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """«День продавца»: все разговоры продавца за ту же дату, бейдж и запись смены.

    Смену и выгрузку берём из кусков записи бейджа (recorder.audio_chunks). Если
    кусков нет (запись загрузили вручную), shift и uploaded_at будут пустыми.
    """
    org_id, forced_store_id = org_store_conditions(user)
    base_sql = """
        SELECT c.id, c.seller_id, c.session_date, r.device_id, r.source, r.created_at AS uploaded_at,
               s.first_name, s.last_name
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        WHERE c.id = :conv_id AND c.organization_id = :org_id
    """
    params: dict = {"conv_id": conversation_id, "org_id": uuid.UUID(org_id)}
    if forced_store_id:
        base_sql += " AND c.store_id = :store_id"
        params["store_id"] = forced_store_id
    base = (await db.execute(text(base_sql), params)).fetchone()
    if not base:
        raise HTTPException(status_code=404, detail="Conversation not found")

    rows = (await db.execute(text("""
        SELECT c.id, c.outcome, c.overall_score, c.is_scorable, c.topic,
               COALESCE(r.started_at, c.analyzed_at) AS started_at, r.duration_seconds
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE c.organization_id = :org_id AND c.seller_id = :seller_id AND c.session_date = :day
        ORDER BY 6
    """), {"org_id": uuid.UUID(org_id), "seller_id": base.seller_id, "day": base.session_date})).fetchall()

    badge = None
    shift = None
    uploaded_at = base.uploaded_at if base.source == "badge" else None
    if base.device_id:
        dev = (await db.execute(text("""
            SELECT serial_number, model FROM admin_schema.devices
            WHERE id = :id AND organization_id = :org_id
        """), {"id": base.device_id, "org_id": uuid.UUID(org_id)})).fetchone()
        if dev:
            badge = {"serial_number": dev.serial_number, "model": dev.model}
            chunks = (await db.execute(text("""
                SELECT MIN(timestamp_start) AS start, MAX(timestamp_end) AS end,
                       MAX(received_at) AS uploaded_at, SUM(duration_ms) AS recorded_ms
                FROM recorder.audio_chunks
                WHERE device_id = :device_id AND session_date = :day
            """), {"device_id": base.device_id, "day": base.session_date})).fetchone()
            if chunks and chunks.start:
                shift = {
                    "start": chunks.start,
                    "end": chunks.end,
                    "recorded_seconds": round((chunks.recorded_ms or 0) / 1000),
                }
                uploaded_at = chunks.uploaded_at

    return {
        "date": str(base.session_date),
        "seller_id": base.seller_id,
        "seller_name": f"{base.first_name or ''} {base.last_name or ''}".strip() or None,
        "source": base.source,
        "badge": badge,
        "shift": shift,
        "uploaded_at": uploaded_at,
        "items": [
            {
                "id": r.id,
                "started_at": r.started_at,
                "duration_seconds": r.duration_seconds,
                "outcome": r.outcome,
                "overall_score": float(r.overall_score) if r.overall_score is not None else None,
                "is_scorable": r.is_scorable,
                "topic": r.topic,
                "is_current": r.id == conversation_id,
            }
            for r in rows
        ],
    }


@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, _ = org_store_conditions(user)

    # Get conversation from analytics with seller/store names
    sql = text("""
        SELECT c.id, c.recording_id, c.seller_id, c.store_id, c.session_date,
               c.overall_score, c.outcome, c.outcome_confidence, c.topic, c.sentiment_avg, c.analyzed_at,
               c.is_scorable, c.call_category, c.contact_reason,
               c.has_upsell, c.upsell_results,
               c.has_crosssell, c.crosssell_results,
               c.talk_ratio, c.interruptions_count, c.longest_monologue_seconds, c.silence_ratio,
               c.summary, c.summary_generated_at,
               r.started_at,
               r.duration_seconds,
               r.source, r.call_direction, r.client_phone, r.operator_phone, r.call_metadata,
               s.first_name AS seller_first_name, s.last_name AS seller_last_name,
               st.name AS store_name
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE c.id = :conv_id AND c.organization_id = :org_id
    """)
    row = (await db.execute(sql, {"conv_id": conversation_id, "org_id": uuid.UUID(org_id)})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    recording_id = str(row.recording_id)

    # Fetch transcript directly from DB (same postgres, no auth needed)
    transcript_sql = text("""
        SELECT id, full_text, language, duration_seconds, status
        FROM transcription.transcripts
        WHERE recording_id = :rec_id
        LIMIT 1
    """)
    t_row = (await db.execute(transcript_sql, {"rec_id": row.recording_id})).fetchone()

    segments = []
    transcript_data = {}
    if t_row:
        seg_sql = text("""
            SELECT id, speaker_role, text, start_ms, end_ms, segment_index
            FROM transcription.transcript_segments
            WHERE transcript_id = :t_id
            ORDER BY segment_index
        """)
        seg_rows = (await db.execute(seg_sql, {"t_id": t_row.id})).fetchall()
        segments = [
            {
                "speaker_role": s.speaker_role,
                "text": s.text,
                "start_ms": s.start_ms,
                "end_ms": s.end_ms,
            }
            for s in seg_rows
        ]
        transcript_data = {
            "id": str(t_row.id),
            "full_text": t_row.full_text,
            "duration_seconds": t_row.duration_seconds or (row.duration_seconds if hasattr(row, 'duration_seconds') else None),
            "status": t_row.status,
            "segments": segments,
        }

    # Get script results — JOIN scripts.script_templates чтобы достать short_name.
    scripts_sql = text("""
        SELECT csr.script_name, csr.script_score, csr.was_applied, csr.violations,
               csr.block_results, csr.script_template_id,
               cs.step_name, cs.score AS step_score, cs.step_detected, cs.evidence_text,
               cs.step_weight, ss.step_order,
               st.short_name AS script_short_name, st.script_type, st.full_text AS script_full_text
        FROM analytics.conversation_script_results csr
        LEFT JOIN analytics.conversation_scores cs ON cs.conversation_id = csr.conversation_id
            AND cs.script_template_id = csr.script_template_id
        LEFT JOIN scripts.script_steps ss ON ss.id = cs.script_step_id
        LEFT JOIN scripts.script_templates st ON st.id = csr.script_template_id
        WHERE csr.conversation_id = :conv_id
        ORDER BY csr.script_name, ss.step_order NULLS LAST
    """)
    script_rows = (await db.execute(scripts_sql, {"conv_id": conversation_id})).fetchall()

    # Build script results
    scripts_map: dict = {}
    fulltext_template_ids: set = set()
    for sr in script_rows:
        key = sr.script_name
        if key not in scripts_map:
            scripts_map[key] = {
                "script_name": sr.script_name,
                "script_short_name": sr.script_short_name,
                "script_type": sr.script_type or "staged",
                "script_template_id": str(sr.script_template_id) if sr.script_template_id else None,
                "script_score": float(sr.script_score) if sr.script_score else None,
                "was_applied": sr.was_applied,
                "violations": sr.violations or [],
                "step_scores": [],
                "block_results": sr.block_results or [],
            }
            if (sr.script_type or "staged") == "fulltext" and sr.script_template_id:
                fulltext_template_ids.add(sr.script_template_id)
        if sr.step_name:
            scripts_map[key]["step_scores"].append({
                "step_name": sr.step_name,
                "score": float(sr.step_score) if sr.step_score else 0,
                "detected": sr.step_detected,
                "evidence": sr.evidence_text,
                "weight": float(sr.step_weight) if sr.step_weight is not None else None,
            })

    # Для fulltext-скриптов дотягиваем тексты блоков (block_results хранит только статусы) —
    # нужны для отображения «скрипт vs разговор» в карточке.
    if fulltext_template_ids:
        blocks_sql = text("""
            SELECT id, template_id, title, text, block_type, is_mandatory, block_order
            FROM scripts.script_blocks
            WHERE template_id = ANY(:tpl_ids)
        """)
        block_rows = (await db.execute(blocks_sql, {"tpl_ids": list(fulltext_template_ids)})).fetchall()
        blocks_by_id = {str(b.id): b for b in block_rows}
        for sm in scripts_map.values():
            for br in (sm["block_results"] or []):
                block = blocks_by_id.get(str(br.get("block_id")))
                if block is not None:
                    br["text"] = block.text
                    br["block_type"] = block.block_type

    # Objections — нужны для подсветки красным маркером в транскрипте.
    objections_sql = text("""
        SELECT type, is_resolved, resolution_technique, raw_text, sort_order
        FROM analytics.objections
        WHERE conversation_id = :conv_id
        ORDER BY sort_order
    """)
    objection_rows = (await db.execute(objections_sql, {"conv_id": conversation_id})).fetchall()

    # Compliance violations — нарушения правил коммуникации
    compliance_sql = text("""
        SELECT id, rule_id, rule_title, severity, evidence, explanation, sort_order
        FROM analytics.conversation_compliance_violations
        WHERE conversation_id = :conv_id
        ORDER BY sort_order
    """)
    compliance_rows = (await db.execute(compliance_sql, {"conv_id": conversation_id})).fetchall()
    compliance_violations_data = [
        {
            "id": str(cv.id),
            "rule_id": str(cv.rule_id),
            "rule_title": cv.rule_title,
            "severity": cv.severity,
            "evidence": cv.evidence or "",
            "explanation": cv.explanation or "",
        }
        for cv in compliance_rows
    ]
    objections_data = [
        {
            "type": o.type,
            "is_resolved": o.is_resolved,
            "resolution_technique": o.resolution_technique,
            "raw_text": o.raw_text,
            "sort_order": o.sort_order,
        }
        for o in objection_rows
    ]

    seller_name = f"{row.seller_first_name or ''} {row.seller_last_name or ''}".strip() or None
    duration = transcript_data.get("duration_seconds") or (row.duration_seconds if hasattr(row, 'duration_seconds') else None)

    conversation_data = {
        "id": row.id,
        "recording_id": row.recording_id,
        "seller_id": row.seller_id,
        "store_id": row.store_id,
        "seller_name": seller_name,
        "store_name": row.store_name,
        "session_date": str(row.session_date),
        "analyzed_at": str(row.analyzed_at) if row.analyzed_at else None,
        "recorded_at": str(row.started_at) if row.started_at else None,
        "duration_seconds": duration,
        "overall_score": float(row.overall_score) if row.overall_score is not None else None,
        "outcome": row.outcome,
        "outcome_confidence": float(row.outcome_confidence) if row.outcome_confidence else None,
        "is_scorable": row.is_scorable,
        "call_category": row.call_category,
        "contact_reason": row.contact_reason,
        "topic": row.topic,
        "sentiment_avg": float(row.sentiment_avg) if row.sentiment_avg else None,
        "has_upsell": row.has_upsell,
        "upsell_results": row.upsell_results,
        "has_crosssell": row.has_crosssell,
        "crosssell_results": row.crosssell_results,
        "source": row.source,
        "call_direction": row.call_direction,
        "client_phone": row.client_phone,
        "operator_phone": row.operator_phone,
        "call_metadata": row.call_metadata,
        "talk_ratio": float(row.talk_ratio) if row.talk_ratio is not None else None,
        "interruptions_count": row.interruptions_count,
        "longest_monologue_seconds": row.longest_monologue_seconds,
        "silence_ratio": float(row.silence_ratio) if row.silence_ratio is not None else None,
        # Резюме LLM, если уже составлено (генерация — отдельным запросом в analytics-engine)
        "summary": row.summary,
        "script_results": list(scripts_map.values()),
        "objections": objections_data,
        "compliance_violations": compliance_violations_data,
    }

    return {
        "conversation": conversation_data,
        "transcript": transcript_data,
    }
