"""Данные главного экрана «Обзор» (ui-concept/dashboard.html), которых нет в /overview:
пульс недели по получасам, недельные ряды за 12 недель, нарушения по правилам
и этапы скрипта, на которых теряются баллы.
"""
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings
from app.routers.conversations import VIEW_CONDITIONS, _sell_array, _json_len
from app.routers.notifications import get_score_threshold

router = APIRouter(prefix="/api/v1/dashboard/overview", tags=["overview"])

# Время начала разговора в часовом поясе магазинов
_LOCAL_START = "(COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz)"

# Правило сработало: продавец должен был предложить хотя бы одну позицию
SELL_NEED = f"""EXISTS(
    SELECT 1 FROM jsonb_array_elements({_sell_array('c.upsell_results')} || {_sell_array('c.crosssell_results')}) e
    WHERE {_json_len("e->'required_offers'")} > 0
)"""
# …и предложил хотя бы одну
SELL_DONE = f"""EXISTS(
    SELECT 1 FROM jsonb_array_elements({_sell_array('c.upsell_results')} || {_sell_array('c.crosssell_results')}) e
    WHERE {_json_len("e->'offered_items'")} > 0
)"""


def _scope(user: dict, store_id: uuid.UUID | None) -> tuple[str, dict]:
    org_id, forced_store_id = org_store_conditions(user)
    effective = forced_store_id or store_id
    where = "c.organization_id = :org_id"
    params: dict = {"org_id": uuid.UUID(org_id)}
    if effective:
        where += " AND c.store_id = :store_id"
        params["store_id"] = effective
    return where, params


@router.get("/pulse")
async def get_pulse(
    store_id: uuid.UUID | None = None,
    days: int = Query(default=7, ge=1, le=14),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Пульс: разговоры по дням и получасам за последние `days` дней (по умолчанию неделя)
    и сколько из них требуют внимания."""
    where, params = _scope(user, store_id)
    date_to = date.today()
    date_from = date_to - timedelta(days=days - 1)
    params.update({"date_from": date_from, "date_to": date_to, "tz": settings.LOCAL_TZ})
    params["threshold"] = await get_score_threshold(db, user["organization_id"], params.get("store_id"))
    attention = VIEW_CONDITIONS["attention"]
    violations = VIEW_CONDITIONS["violations"]

    rows = (await db.execute(text(f"""
        SELECT c.session_date AS day,
               (EXTRACT(HOUR FROM {_LOCAL_START}) * 2 + FLOOR(EXTRACT(MINUTE FROM {_LOCAL_START}) / 30))::int AS bin,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE {attention}) AS flagged,
               COUNT(*) FILTER (WHERE {violations}) AS violations,
               COALESCE(SUM(r.duration_seconds), 0) AS talk_seconds
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE {where} AND c.session_date BETWEEN :date_from AND :date_to
        GROUP BY 1, 2
        ORDER BY 1, 2
    """), params)).fetchall()

    by_day: dict = {}
    for r in rows:
        d = by_day.setdefault(r.day, {"total": 0, "flagged": 0, "bins": []})
        d["total"] += r.total
        d["flagged"] += r.flagged
        d["bins"].append([r.bin, r.total, r.flagged])

    total = sum(d["total"] for d in by_day.values())
    flagged = sum(d["flagged"] for d in by_day.values())
    n_violations = sum(r.violations for r in rows)
    return {
        "date_from": str(date_from),
        "date_to": str(date_to),
        "timezone": settings.LOCAL_TZ,
        "days": [
            {
                "date": str(date_from + timedelta(days=i)),
                **by_day.get(date_from + timedelta(days=i), {"total": 0, "flagged": 0, "bins": []}),
            }
            for i in range(days)
        ],
        "totals": {
            "conversations": total,
            "attention": flagged,
            "violations": n_violations,
            "low_score": flagged - n_violations,
            "talk_seconds": int(sum(r.talk_seconds for r in rows)),
        },
    }


@router.get("/trends")
async def get_trends(
    store_id: uuid.UUID | None = None,
    weeks: int = Query(default=12, ge=2, le=52),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Недельные ряды за `weeks` недель (неделя с понедельника, последняя — текущая):
    показатели сети, конверсия и балл магазинов, балл продавцов."""
    where, params = _scope(user, store_id)
    today = date.today()
    last_monday = today - timedelta(days=today.weekday())
    first_monday = last_monday - timedelta(weeks=weeks - 1)
    params.update({"date_from": first_monday, "date_to": today})
    week_list = [first_monday + timedelta(weeks=i) for i in range(weeks)]
    idx = {w: i for i, w in enumerate(week_list)}
    base = f"{where} AND c.session_date BETWEEN :date_from AND :date_to"

    def series(default=None):
        return [default] * weeks

    rows = (await db.execute(text(f"""
        SELECT date_trunc('week', c.session_date)::date AS week,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE c.is_scorable) AS scorable,
               COUNT(*) FILTER (WHERE c.is_scorable AND c.outcome = 'purchase') AS purchases,
               AVG(c.overall_score) FILTER (WHERE c.is_scorable) AS avg_score,
               COUNT(*) FILTER (WHERE {SELL_NEED}) AS sell_need,
               COUNT(*) FILTER (WHERE {SELL_NEED} AND {SELL_DONE}) AS sell_done
        FROM analytics.conversations c
        WHERE {base}
        GROUP BY 1
    """), params)).fetchall()
    obj_rows = (await db.execute(text(f"""
        SELECT date_trunc('week', c.session_date)::date AS week,
               COUNT(*) AS total, COUNT(*) FILTER (WHERE o.is_resolved) AS resolved
        FROM analytics.objections o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {base}
        GROUP BY 1
    """), params)).fetchall()

    net = {k: series(0) for k in ("total", "scorable", "purchases", "sell_need", "sell_done", "objections", "objections_resolved")}
    net["avg_score"] = series()
    for r in rows:
        i = idx.get(r.week)
        if i is None:
            continue
        net["total"][i] = r.total
        net["scorable"][i] = r.scorable
        net["purchases"][i] = r.purchases
        net["sell_need"][i] = r.sell_need
        net["sell_done"][i] = r.sell_done
        net["avg_score"][i] = round(float(r.avg_score), 1) if r.avg_score is not None else None
    for r in obj_rows:
        i = idx.get(r.week)
        if i is not None:
            net["objections"][i] = r.total
            net["objections_resolved"][i] = r.resolved

    store_rows = (await db.execute(text(f"""
        SELECT c.store_id, st.name AS store_name, date_trunc('week', c.session_date)::date AS week,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE c.is_scorable) AS scorable,
               COUNT(*) FILTER (WHERE c.is_scorable AND c.outcome = 'purchase') AS purchases,
               AVG(c.overall_score) FILTER (WHERE c.is_scorable) AS avg_score
        FROM analytics.conversations c
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {base}
        GROUP BY 1, 2, 3
    """), params)).fetchall()
    stores: dict = {}
    for r in store_rows:
        s = stores.setdefault(r.store_id, {
            "store_id": r.store_id, "store_name": r.store_name,
            "total": series(0), "scorable": series(0), "purchases": series(0), "avg_score": series(),
        })
        i = idx.get(r.week)
        if i is None:
            continue
        s["total"][i] = r.total
        s["scorable"][i] = r.scorable
        s["purchases"][i] = r.purchases
        s["avg_score"][i] = round(float(r.avg_score), 1) if r.avg_score is not None else None

    seller_rows = (await db.execute(text(f"""
        SELECT c.seller_id, s.first_name, s.last_name, st.name AS store_name,
               date_trunc('week', c.session_date)::date AS week,
               COUNT(*) AS total,
               AVG(c.overall_score) FILTER (WHERE c.is_scorable) AS avg_score
        FROM analytics.conversations c
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = s.store_id
        WHERE {base}
        GROUP BY 1, 2, 3, 4, 5
    """), params)).fetchall()
    sellers: dict = {}
    for r in seller_rows:
        s = sellers.setdefault(r.seller_id, {
            "seller_id": r.seller_id,
            "seller_name": f"{r.first_name or ''} {r.last_name or ''}".strip() or None,
            "store_name": r.store_name,
            "total": series(0), "avg_score": series(),
        })
        i = idx.get(r.week)
        if i is None:
            continue
        s["total"][i] = r.total
        s["avg_score"][i] = round(float(r.avg_score), 1) if r.avg_score is not None else None

    return {
        "weeks": [str(w) for w in week_list],
        "network": net,
        "stores": list(stores.values()),
        "sellers": list(sellers.values()),
    }


@router.get("/violations")
async def get_violations_by_rule(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Нарушения по правилам за период: сколько разговоров, кто нарушал и сколько
    было за такой же период до этого."""
    where, params = _scope(user, store_id)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=29)
    span = (date_to - date_from).days + 1
    params.update({
        "date_from": date_from, "date_to": date_to,
        "prev_from": date_from - timedelta(days=span), "prev_to": date_from - timedelta(days=1),
    })
    rows = (await db.execute(text(f"""
        SELECT v.rule_id, v.rule_title,
               MAX(CASE v.severity WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END) AS sev,
               COUNT(DISTINCT v.conversation_id) FILTER (WHERE c.session_date BETWEEN :date_from AND :date_to) AS count,
               COUNT(DISTINCT v.conversation_id) FILTER (WHERE c.session_date BETWEEN :prev_from AND :prev_to) AS prev,
               COUNT(DISTINCT c.seller_id) FILTER (WHERE c.session_date BETWEEN :date_from AND :date_to) AS sellers_count,
               (ARRAY_AGG(DISTINCT TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))
                    FILTER (WHERE c.session_date BETWEEN :date_from AND :date_to))[1:3] AS sellers
        FROM analytics.conversation_compliance_violations v
        JOIN analytics.conversations c ON c.id = v.conversation_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        WHERE {where} AND c.session_date BETWEEN :prev_from AND :date_to
        GROUP BY v.rule_id, v.rule_title
        HAVING COUNT(*) FILTER (WHERE c.session_date BETWEEN :date_from AND :date_to) > 0
        ORDER BY sev DESC, count DESC
    """), params)).fetchall()
    total = (await db.execute(text(f"""
        SELECT COUNT(DISTINCT c.id) FROM analytics.conversations c
        JOIN analytics.conversation_compliance_violations v ON v.conversation_id = c.id
        WHERE {where} AND c.session_date BETWEEN :date_from AND :date_to
    """), params)).scalar_one()
    return {
        "conversations": total,
        "items": [
            {
                "rule_id": r.rule_id,
                "rule_title": r.rule_title,
                "severity": {2: "high", 1: "medium"}.get(r.sev, "low"),
                "count": r.count,
                "prev": r.prev,
                "sellers_count": r.sellers_count,
                "sellers": [x for x in (r.sellers or []) if x],
            }
            for r in rows
        ],
    }


@router.get("/step-losses")
async def get_step_losses(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    weak_below: float = 50,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Где теряем баллы: этапы основного скрипта периода (по числу оценённых разговоров)
    и доля разговоров, где этап пропущен или слабый (балл ниже `weak_below`)."""
    where, params = _scope(user, store_id)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=29)
    params.update({"date_from": date_from, "date_to": date_to, "weak": weak_below})
    base = f"{where} AND c.session_date BETWEEN :date_from AND :date_to"
    tpl = (await db.execute(text(f"""
        SELECT cs.script_template_id AS id, t.name, COUNT(DISTINCT cs.conversation_id) AS n
        FROM analytics.conversation_scores cs
        JOIN analytics.conversations c ON c.id = cs.conversation_id
        LEFT JOIN scripts.script_templates t ON t.id = cs.script_template_id
        WHERE {base}
        GROUP BY 1, 2
        ORDER BY n DESC
        LIMIT 1
    """), params)).fetchone()
    if not tpl:
        return {"script": None, "conversations": 0, "steps": []}
    params["tpl"] = tpl.id
    # Шаги группируем по названию: после правки скрипта у этапа новый id, а оценки
    # старых разговоров ссылаются на прежний. Если в скрипте есть текущие этапы —
    # показываем только их.
    rows = (await db.execute(text(f"""
        WITH cur AS (
            SELECT name, step_order, is_required, weight, COALESCE(recommendation_text, description) AS hint
            FROM scripts.script_steps WHERE template_id = :tpl
        )
        SELECT cs.step_name AS name,
               MIN(cur.step_order) AS step_order,
               BOOL_AND(COALESCE(cur.is_required, TRUE)) AS is_required,
               COALESCE(MAX(cur.weight), AVG(cs.step_weight)) AS weight,
               MAX(cur.hint) AS hint,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE cs.score < :weak OR NOT cs.step_detected) AS weak,
               AVG(cs.score) AS avg_score
        FROM analytics.conversation_scores cs
        JOIN analytics.conversations c ON c.id = cs.conversation_id
        LEFT JOIN cur ON cur.name = cs.step_name
        WHERE {base} AND cs.script_template_id = :tpl
          AND (cur.name IS NOT NULL OR NOT EXISTS (SELECT 1 FROM cur))
        GROUP BY cs.step_name
        ORDER BY MIN(cur.step_order) NULLS LAST, cs.step_name
    """), params)).fetchall()
    return {
        "script": {"id": tpl.id, "name": tpl.name},
        "conversations": tpl.n,
        "steps": [
            {
                "name": r.name,
                "order": r.step_order,
                "required": r.is_required if r.is_required is not None else True,
                "weight": round(float(r.weight), 3) if r.weight is not None else None,
                "total": r.total,
                "weak": r.weak,
                "weak_share": round(r.weak / r.total * 100, 1) if r.total else 0,
                "avg_score": round(float(r.avg_score), 1) if r.avg_score is not None else None,
                "hint": r.hint,
            }
            for r in rows
        ],
    }
