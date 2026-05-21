import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app import redis_client as rc
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["analytics"])


# v2 — cache namespace bump so prior buggy responses don't stick around.
CACHE_VERSION = "v3"

REFUSAL_OUTCOMES = ("price_refusal", "competitor", "deferred")

FUNNEL_STAGES = [
    "Все разговоры",
    "Выявление потребности",
    "Презентация",
    "Работа с возражениями",
    "Закрытие сделки",
    "Покупка",
]

STEP_PATTERNS = {
    "Выявление потребности": ("выявлен", "потребност", "квалифик", "повод", "образ"),
    "Презентация": ("презентац", "демонстрац", "показ"),
    "Работа с возражениями": ("возражен",),
    "Закрытие сделки": ("закрыт", "сделк"),
}


def _resolve_period(period: int | None) -> tuple[date, date]:
    today = date.today()
    days = period if period and period > 0 else 30
    return today - timedelta(days=days), today


def _build_filter(effective_store_id) -> tuple[str, dict]:
    """Return (store_filter_sql, params_seed). Caller fills :org_id, :date_from, :date_to, :store_id."""
    if effective_store_id:
        return "AND c.store_id = :store_id", {"store_id": effective_store_id}
    return "", {}


# ---------- Возражения ----------

@router.get("/objections/distribution")
async def get_objections_distribution(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:obj-dist:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    sql = text(f"""
        SELECT o.type, COUNT(*) AS cnt
        FROM analytics.objections o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY o.type
        ORDER BY cnt DESC
        LIMIT 7
    """)
    rows = (await db.execute(sql, params)).fetchall()
    total = sum(r.cnt for r in rows) or 1

    result = [
        {"type": r.type, "count": int(r.cnt), "percentage": round(r.cnt * 100 / total, 1)}
        for r in rows
    ]
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


@router.get("/objections/resolution")
async def get_objections_resolution(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """% успешно отработанных возражений по типу."""
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:obj-res:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    sql = text(f"""
        SELECT o.type,
               COUNT(*) AS total,
               SUM(CASE WHEN o.is_resolved THEN 1 ELSE 0 END) AS resolved
        FROM analytics.objections o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY o.type
        ORDER BY total DESC
        LIMIT 7
    """)
    rows = (await db.execute(sql, params)).fetchall()

    result = [
        {
            "type": r.type,
            "total": int(r.total),
            "resolved": int(r.resolved or 0),
            "resolution_rate": round((r.resolved or 0) * 100 / r.total, 1) if r.total else 0,
        }
        for r in rows
    ]
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


@router.get("/objections/impact")
async def get_objections_impact(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Влияние возражения на сделку: для каждого типа — конверсия среди разговоров, где оно появлялось.

    Считаем по DISTINCT conversation_id — никакого раздувания, если возражение типа X в одном
    разговоре встречается несколько раз.
    """
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:obj-impact:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    # Baseline conversion across all conversations in the period — для сравнения.
    base_sql = text(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN c.outcome = 'purchase' THEN 1 ELSE 0 END) AS purchases
        FROM analytics.conversations c
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
    """)
    base = (await db.execute(base_sql, params)).fetchone()
    base_rate = (base.purchases / base.total * 100) if base and base.total else 0

    # Per type — distinct conversation counts.
    sql = text(f"""
        WITH obj_conv AS (
            SELECT DISTINCT o.type, c.id AS conv_id, c.outcome
            FROM analytics.objections o
            JOIN analytics.conversations c ON c.id = o.conversation_id
            WHERE c.organization_id = :org_id
              AND c.session_date BETWEEN :date_from AND :date_to
              {store_filter}
        )
        SELECT type,
               COUNT(*) AS conversations,
               SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END) AS purchases,
               SUM(CASE WHEN outcome IN ('price_refusal', 'competitor', 'deferred') THEN 1 ELSE 0 END) AS refusals
        FROM obj_conv
        GROUP BY type
        ORDER BY conversations DESC
        LIMIT 7
    """)
    rows = (await db.execute(sql, params)).fetchall()

    items = [
        {
            "type": r.type,
            "conversations": int(r.conversations),
            "purchases": int(r.purchases or 0),
            "refusals": int(r.refusals or 0),
            "conversion": round((r.purchases or 0) * 100 / r.conversations, 1) if r.conversations else 0,
        }
        for r in rows
    ]

    result = {
        "baseline_conversion": round(base_rate, 1),
        "items": items,
    }
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


# ---------- Конверсия ----------

@router.get("/conversion/funnel")
async def get_conversion_funnel(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Универсальная воронка: все этапы всегда видны (даже c 0)."""
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:funnel:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    # Total conversations.
    total = (await db.execute(text(f"""
        SELECT COUNT(*) FROM analytics.conversations c
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
    """), params)).scalar_one() or 0

    # Detected steps (script-based) — per stage.
    step_rows = (await db.execute(text(f"""
        SELECT cs.step_name, COUNT(DISTINCT c.id) AS cnt
        FROM analytics.conversation_scores cs
        JOIN analytics.conversations c ON c.id = cs.conversation_id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          AND cs.step_detected = TRUE
          {store_filter}
        GROUP BY cs.step_name
    """), params)).fetchall()

    stage_counts: dict[str, int] = {s: 0 for s in FUNNEL_STAGES}
    stage_counts["Все разговоры"] = int(total)

    for sr in step_rows:
        name_lower = (sr.step_name or "").lower()
        for stage, patterns in STEP_PATTERNS.items():
            if any(p in name_lower for p in patterns):
                stage_counts[stage] = max(stage_counts[stage], int(sr.cnt))
                break

    # Objections stage — fallback if no script-step "Работа с возражениями" detected.
    with_obj = (await db.execute(text(f"""
        SELECT COUNT(DISTINCT c.id)
        FROM analytics.conversations c
        JOIN analytics.objections o ON o.conversation_id = c.id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
    """), params)).scalar_one() or 0
    stage_counts["Работа с возражениями"] = max(
        stage_counts["Работа с возражениями"], int(with_obj)
    )

    # Purchase stage.
    purchases = (await db.execute(text(f"""
        SELECT COUNT(*) FROM analytics.conversations c
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          AND c.outcome = 'purchase'
          {store_filter}
    """), params)).scalar_one() or 0
    stage_counts["Покупка"] = int(purchases)

    base = stage_counts["Все разговоры"] or 1
    result = [
        {
            "stage": stage,
            "count": stage_counts[stage],
            "percentage": round(stage_counts[stage] * 100 / base, 1),
        }
        for stage in FUNNEL_STAGES
    ]
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


@router.get("/conversion/by-store")
async def get_conversion_by_store(
    period: int | None = Query(default=30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:conv-store:{org_id}:{forced_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(forced_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    sql = text(f"""
        SELECT
            COALESCE(st.name, 'Без магазина') AS store_name,
            COUNT(*) AS total,
            SUM(CASE WHEN c.outcome = 'purchase' THEN 1 ELSE 0 END) AS purchases,
            (SUM(CASE WHEN c.outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT
                / NULLIF(COUNT(*), 0)) AS conv_rate
        FROM analytics.conversations c
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY c.store_id, st.name
        ORDER BY conv_rate DESC NULLS LAST, total DESC
    """)
    rows = (await db.execute(sql, params)).fetchall()

    result = [
        {
            "store_name": r.store_name,
            "total": int(r.total),
            "purchases": int(r.purchases or 0),
            "conversion_rate": round(float(r.conv_rate), 4) if r.conv_rate is not None else 0,
        }
        for r in rows
    ]
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


@router.get("/conversion/by-seller")
async def get_conversion_by_seller(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:conv-seller:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    sql = text(f"""
        SELECT
            c.seller_id,
            COALESCE(NULLIF(TRIM(CONCAT(s.first_name, ' ', s.last_name)), ''), 'Без имени') AS seller_name,
            COUNT(*) AS total,
            SUM(CASE WHEN c.outcome = 'purchase' THEN 1 ELSE 0 END) AS purchases,
            (SUM(CASE WHEN c.outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT
                / NULLIF(COUNT(*), 0)) AS conv_rate
        FROM analytics.conversations c
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY c.seller_id, s.first_name, s.last_name
        ORDER BY conv_rate DESC NULLS LAST, total DESC
        LIMIT 10
    """)
    rows = (await db.execute(sql, params)).fetchall()

    result = [
        {
            "seller_name": r.seller_name,
            "total": int(r.total),
            "purchases": int(r.purchases or 0),
            "conversion_rate": round(float(r.conv_rate), 4) if r.conv_rate is not None else 0,
        }
        for r in rows
    ]
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


@router.get("/conversion/outcomes")
async def get_conversion_outcomes(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Распределение исходов: purchase / deferred / price_refusal / competitor / unknown."""
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:conv-outcomes:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    sql = text(f"""
        SELECT COALESCE(c.outcome, 'unknown') AS outcome, COUNT(*) AS cnt
        FROM analytics.conversations c
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY c.outcome
    """)
    rows = (await db.execute(sql, params)).fetchall()
    total = sum(r.cnt for r in rows) or 1

    result = [
        {
            "outcome": r.outcome,
            "count": int(r.cnt),
            "percentage": round(r.cnt * 100 / total, 1),
        }
        for r in rows
    ]
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result


@router.get("/conversion/objection-handling-impact")
async def get_objection_handling_impact(
    period: int | None = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Сравнение конверсии: без возражений / все возражения отработаны / есть неотработанные."""
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from, date_to = _resolve_period(period)

    cache_key = f"dashboard:{CACHE_VERSION}:obj-handling:{org_id}:{effective_store_id or 'all'}:{date_from}_{date_to}"
    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter, extra = _build_filter(effective_store_id)
    params = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to, **extra}

    sql = text(f"""
        WITH conv_obj AS (
            SELECT c.id, c.outcome,
                   COUNT(o.id) AS obj_count,
                   SUM(CASE WHEN o.is_resolved THEN 1 ELSE 0 END) AS resolved_count
            FROM analytics.conversations c
            LEFT JOIN analytics.objections o ON o.conversation_id = c.id
            WHERE c.organization_id = :org_id
              AND c.session_date BETWEEN :date_from AND :date_to
              {store_filter}
            GROUP BY c.id, c.outcome
        )
        SELECT
            CASE
                WHEN obj_count = 0 THEN 'no_objections'
                WHEN resolved_count = obj_count THEN 'all_resolved'
                ELSE 'some_unresolved'
            END AS bucket,
            COUNT(*) AS total,
            SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END) AS purchases
        FROM conv_obj
        GROUP BY bucket
    """)
    rows = (await db.execute(sql, params)).fetchall()

    by_bucket = {r.bucket: r for r in rows}

    def _stat(key: str) -> dict:
        r = by_bucket.get(key)
        total = int(r.total) if r else 0
        purchases = int(r.purchases or 0) if r else 0
        return {
            "total": total,
            "purchases": purchases,
            "conversion_rate": round(purchases / total, 4) if total else 0,
        }

    result = {
        "no_objections": _stat("no_objections"),
        "all_resolved": _stat("all_resolved"),
        "some_unresolved": _stat("some_unresolved"),
    }
    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result
