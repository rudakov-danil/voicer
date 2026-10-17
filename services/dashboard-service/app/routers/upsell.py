"""Допродажи: аналитика для руководителя, план смены и экран сотрудника «Моя смена».

Данные — из разбора допродаж (analytics-engine, миграция 0010):
  analytics.conversations.offer_opportunity / offers_count / offers_accepted / check_total / …
  analytics.conversation_offers — каждое предложение с приёмом и реакцией клиента
  analytics.upsell_plans — план: доля заказов с предложением, принятые за смену, «товар дня»

Заказ = разговор с offer_opportunity = TRUE (клиент что-то заказывал). Попытка = заказ,
в котором было хотя бы одно предложение. Конверсия предложений = принятые / все предложения.
"""
import uuid
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.org_settings import org_tz
from app.database import get_db
from app.dependencies import get_current_user, get_mobile_user, org_store_conditions

router = APIRouter(prefix="/api/v1/dashboard", tags=["upsell"])

# План по умолчанию, пока руководитель не задал свой: предложение в 7 заказах из 10
DEFAULT_ATTEMPT_RATE_TARGET = 0.7
# Сильные приёмы: конкретика, выбор, аргумент, акция. «Что-нибудь ещё?» — слабый.
STRONG_TECHNIQUES = ("specific", "choice", "benefit", "promo")
TECHNIQUE_LABELS = {
    "generic": "«Что-нибудь ещё?»",
    "specific": "Конкретный товар",
    "choice": "Выбор из вариантов",
    "benefit": "С аргументом",
    "promo": "Акция или комбо",
}


def _rate(part, whole) -> float | None:
    return round(part / whole, 4) if whole else None


def _num(v) -> float | None:
    return round(float(v), 2) if v is not None else None


def _allowed_stores(user: dict) -> list[str] | None:
    """None — все магазины организации; иначе список доступных магазинов."""
    role = user.get("role")
    if role in ("manager", "employee"):
        return [str(user.get("store_id"))] if user.get("store_id") else []
    if role == "rop":
        return [str(s) for s in user.get("rop_stores", [])]
    return None


def _check_store(user: dict, store_id) -> None:
    allowed = _allowed_stores(user)
    if allowed is not None and str(store_id) not in allowed:
        raise HTTPException(status_code=404, detail="Store not found")


async def _seller_or_404(db: AsyncSession, user: dict, seller_id: uuid.UUID):
    row = (await db.execute(text("""
        SELECT s.id, s.first_name, s.last_name, s.store_id, st.name AS store_name
        FROM admin_schema.sellers s
        LEFT JOIN admin_schema.stores st ON st.id = s.store_id
        WHERE s.id = :seller_id AND s.organization_id = :org_id
    """), {"seller_id": seller_id, "org_id": uuid.UUID(user["organization_id"])})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Seller not found")
    if user.get("role") == "employee" and str(seller_id) != user.get("seller_id"):
        raise HTTPException(status_code=404, detail="Seller not found")
    allowed = _allowed_stores(user)
    if allowed is not None and str(row.store_id) not in allowed:
        raise HTTPException(status_code=404, detail="Seller not found")
    return row


async def resolve_plan(db: AsyncSession, org_id: uuid.UUID, store_id, seller_id) -> dict:
    """Действующий план: каждое поле берётся из самого частного плана, где оно задано
    (сотрудник → магазин → организация → дефолт)."""
    rows = (await db.execute(text("""
        SELECT store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items
        FROM analytics.upsell_plans
        WHERE organization_id = :org_id
          AND (store_id IS NULL OR store_id = :store_id)
          AND (seller_id IS NULL OR seller_id = :seller_id)
        ORDER BY (seller_id IS NOT NULL) DESC, (store_id IS NOT NULL) DESC
    """), {"org_id": org_id, "store_id": store_id, "seller_id": seller_id})).fetchall()

    def scope(r) -> str:
        return "seller" if r.seller_id else "store" if r.store_id else "organization"

    plan = {
        "attempt_rate_target": DEFAULT_ATTEMPT_RATE_TARGET, "attempt_rate_source": "default",
        "accepted_per_shift": None, "accepted_source": None,
        "focus_items": [], "focus_source": None,
    }
    for r in reversed(rows):  # от общего к частному: частный перезаписывает
        if r.attempt_rate_target is not None:
            plan["attempt_rate_target"] = float(r.attempt_rate_target)
            plan["attempt_rate_source"] = scope(r)
        if r.accepted_per_shift is not None:
            plan["accepted_per_shift"] = r.accepted_per_shift
            plan["accepted_source"] = scope(r)
        if r.focus_items:
            plan["focus_items"] = list(r.focus_items)
            plan["focus_source"] = scope(r)
    return plan


# ─── Экран сотрудника «Моя смена» ────────────────────────────────────────────

@router.get("/sellers/{seller_id}/shift")
async def seller_shift(
    seller_id: uuid.UUID,
    day: date | None = None,
    user: dict = Depends(get_mobile_user),
    db: AsyncSession = Depends(get_db),
):
    """Всё, что сотруднику полезно видеть во время смены: план и прогресс, серия заказов
    с предложением, лучшая фраза дня, лента заказов с подсказками, место в команде."""
    seller = await _seller_or_404(db, user, seller_id)
    org_id = uuid.UUID(user["organization_id"])
    day = day or date.today()
    is_demo = (await db.execute(text("SELECT slug FROM auth.organizations WHERE id=:id"), {"id":org_id})).scalar() == "horeca-demo"
    params = {"org_id": org_id, "seller_id": seller_id, "day": day, "store_id": seller.store_id,
              "tz": await org_tz(db, org_id), "week_from": day - timedelta(days=7), "week_to": day - timedelta(days=1)}

    plan = await resolve_plan(db, org_id, seller.store_id, seller_id)

    orders = (await db.execute(text("""
        SELECT c.id, c.offers_count, c.offers_accepted, c.check_total, c.order_items,
               c.offer_missed, c.offer_better_phrase,
               COALESCE(r.started_at, c.analyzed_at) AS at,
               to_char(COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz, 'HH24:MI') AS hhmm
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE c.organization_id = :org_id AND c.seller_id = :seller_id
          AND c.session_date = :day AND c.offer_opportunity IS TRUE
        ORDER BY at
    """), params)).fetchall()

    ids = [o.id for o in orders]
    offers = (await db.execute(text("""
        SELECT conversation_id, item, category, technique, response, is_focus, quote, customer_quote, amount
        FROM analytics.conversation_offers
        WHERE conversation_id = ANY(:ids)
        ORDER BY sort_order
    """), {"ids": ids})).fetchall() if ids else []
    by_conv: dict = {}
    for o in offers:
        by_conv.setdefault(o.conversation_id, []).append(o)

    n_orders = len(orders)
    with_offer = sum(1 for o in orders if (o.offers_count or 0) > 0)
    # «Что-нибудь ещё?» не считается предложением — как offers_count в сводке руководителя
    n_offers = sum(1 for o in offers if o.technique != "generic")
    # Согласие на «Что-нибудь ещё?» тоже не в счёт: иначе «согласились» больше, чем «предлагали»
    accepted = sum(1 for o in offers if o.response == "accepted" and o.technique != "generic")
    attempt_rate = _rate(with_offer, n_orders)

    # Серия: подряд идущие заказы с предложением (текущая — с конца смены, и лучшая за смену)
    best_streak = cur = 0
    for o in orders:
        cur = cur + 1 if (o.offers_count or 0) > 0 else 0
        best_streak = max(best_streak, cur)
    current_streak = cur

    techniques: dict = {}
    for o in offers:
        t = techniques.setdefault(o.technique, {"technique": o.technique, "label": TECHNIQUE_LABELS.get(o.technique, o.technique),
                                                "offers": 0, "accepted": 0})
        t["offers"] += 1
        t["accepted"] += o.response == "accepted"

    # Лучшая фраза дня: принятое предложение сильным приёмом, самое свежее
    best_phrase = None
    for o in sorted(offers, key=lambda x: (x.technique in ("benefit", "choice", "promo"), x.is_focus), reverse=True):
        if o.response == "accepted" and o.quote:
            best_phrase = {"quote": o.quote, "item": o.item, "technique": o.technique,
                           "customer_quote": o.customer_quote or None}
            break

    checks_with = [float(o.check_total) for o in orders if o.check_total is not None and (o.offers_accepted or 0) > 0]
    checks_without = [float(o.check_total) for o in orders if o.check_total is not None and not (o.offers_accepted or 0)]
    # Сколько принесли допродажи: сумма принятых предложений с известной ценой. Сравнение средних
    # чеков на одной-двух покупках врёт, а сумма отвечает прямо — фронт сравнивает чеки только на выборке
    # Карта лояльности денег не добавляет — это известный ноль, а не «цена не прозвучала»
    paid = [float(o.amount or 0) for o in offers if o.response == "accepted" and o.technique != "generic"
            and (o.amount is not None or o.category == "loyalty")]
    all_checks = checks_with + checks_without

    # Неделя до сегодняшнего дня — для сравнения «лучше/хуже обычного»
    week = (await db.execute(text("""
        SELECT COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer,
               COALESCE(SUM(c.offers_count), 0) AS offers,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted
        FROM analytics.conversations c
        WHERE c.organization_id = :org_id AND c.seller_id = :seller_id
          AND c.session_date BETWEEN :week_from AND :week_to AND c.offer_opportunity IS TRUE
    """), params)).fetchone()

    # Команда точки сегодня: место по принятым допродажам
    team = (await db.execute(text("""
        SELECT c.seller_id,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted,
               COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer
        FROM analytics.conversations c
        WHERE c.organization_id = :org_id AND c.store_id = :store_id
          AND c.session_date = :day AND c.offer_opportunity IS TRUE
        GROUP BY c.seller_id
        ORDER BY accepted DESC, with_offer DESC
    """), params)).fetchall()
    place = next((i + 1 for i, r in enumerate(team) if r.seller_id == seller_id), None)
    team_orders = sum(r.orders for r in team)
    team_with_offer = sum(r.with_offer for r in team)

    # Записи, которые ещё в обработке: сотрудник видит, что скоро появятся новые заказы
    pending = (await db.execute(text("""
        SELECT COUNT(*) FROM recorder.recordings
        WHERE organization_id = :org_id AND seller_id = :seller_id AND session_date = :day
          AND status NOT IN ('analyzed', 'failed')
    """), params)).scalar() or 0

    focus = plan["focus_items"]
    focus_offered = sum(1 for o in offers if o.is_focus)
    focus_accepted = sum(1 for o in offers if o.is_focus and o.response == "accepted")

    target = plan["attempt_rate_target"]
    accepted_target = plan["accepted_per_shift"]

    return {
        "is_demo": is_demo,
        "seller": {
            "id": str(seller.id),
            "first_name": seller.first_name,
            "last_name": seller.last_name,
            "store_id": str(seller.store_id),
            "store_name": seller.store_name,
        },
        "day": str(day),
        "plan": plan,
        "progress": {
            "attempt_rate": attempt_rate,
            "attempt_rate_target": target,
            "attempt_rate_met": attempt_rate is not None and attempt_rate >= target,
            "accepted": accepted,
            "accepted_target": accepted_target,
            "accepted_pct": _rate(accepted, accepted_target) if accepted_target else None,
        },
        "today": {
            "orders": n_orders,
            "with_offer": with_offer,
            "attempt_rate": attempt_rate,
            "offers": n_offers,
            "accepted": accepted,
            "acceptance_rate": _rate(accepted, n_offers),
            "strong_offers": sum(1 for o in offers if o.technique in STRONG_TECHNIQUES),
            "avg_check_with_upsell": _num(sum(checks_with) / len(checks_with)) if checks_with else None,
            "avg_check_without": _num(sum(checks_without) / len(checks_without)) if checks_without else None,
            "checks_with_n": len(checks_with),
            "checks_without_n": len(checks_without),
            "avg_check": _num(sum(all_checks) / len(all_checks)) if all_checks else None,
            "upsell_revenue": _num(sum(paid)) if any(paid) else None,
            "upsell_revenue_n": len(paid),
            "pending_recordings": int(pending),
        },
        "week": {
            "orders": int(week.orders or 0),
            "attempt_rate": _rate(int(week.with_offer or 0), int(week.orders or 0)),
            "acceptance_rate": _rate(int(week.accepted or 0), int(week.offers or 0)),
        },
        "team": {
            "place": place,
            "of": len(team),
            "attempt_rate": _rate(team_with_offer, team_orders),
        },
        "streak": {"current": current_streak, "best": best_streak},
        "focus": {
            "items": focus,
            "offered": focus_offered,
            "accepted": focus_accepted,
        },
        "best_phrase": best_phrase,
        "techniques": sorted(techniques.values(), key=lambda t: -t["offers"]),
        "orders": [
            {
                "conversation_id": str(o.id),
                "time": o.hhmm,
                "items": o.order_items or [],
                "check_total": _num(o.check_total),
                "offers": [
                    {"item": x.item, "category": x.category, "technique": x.technique,
                     "response": x.response, "is_focus": x.is_focus, "quote": x.quote}
                    for x in by_conv.get(o.id, [])
                ],
                "missed": o.offer_missed,
                "better_phrase": o.offer_better_phrase,
            }
            for o in reversed(orders)  # свежие сверху
        ][:40],
    }


# ─── Аналитика допродаж для руководителя ─────────────────────────────────────

@router.get("/upsell/overview")
async def upsell_overview(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Сводка по допродажам: доля заказов с предложением, конверсия предложений,
    приёмы и их результативность, что предлагают и что берут, часы пик, разрыв чека,
    сотрудники против плана и примеры упущенных возможностей."""
    org_id = uuid.UUID(user["organization_id"])
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=29)
    params: dict = {"org_id": org_id, "date_from": date_from, "date_to": date_to, "tz": await org_tz(db, org_id)}
    scope = ("c.organization_id = :org_id AND c.session_date BETWEEN :date_from AND :date_to "
             "AND c.offer_opportunity IS TRUE")
    allowed = _allowed_stores(user)
    if store_id:
        _check_store(user, store_id)
        scope += " AND c.store_id = :store_id"
        params["store_id"] = store_id
    elif allowed is not None:
        scope += " AND c.store_id = ANY(CAST(:stores AS uuid[]))"
        params["stores"] = allowed

    totals = (await db.execute(text(f"""
        SELECT COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer,
               COALESCE(SUM(c.offers_count), 0) AS offers,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted,
               AVG(c.check_total) FILTER (WHERE COALESCE(c.offers_accepted, 0) > 0) AS check_with,
               AVG(c.check_total) FILTER (WHERE COALESCE(c.offers_accepted, 0) = 0) AS check_without,
               COUNT(c.check_total) FILTER (WHERE COALESCE(c.offers_accepted, 0) > 0) AS checks_with_n,
               COUNT(c.check_total) FILTER (WHERE COALESCE(c.offers_accepted, 0) = 0) AS checks_without_n,
               AVG(c.check_total) AS avg_check,
               COUNT(c.check_total) AS checks_known
        FROM analytics.conversations c
        WHERE {scope}
    """), params)).fetchone()

    # Сколько принесли допродажи: сумма принятых предложений с известной ценой (analytics 0013)
    revenue = (await db.execute(text(f"""
        SELECT c.store_id, COALESCE(SUM(o.amount), 0) AS revenue, COUNT(*) AS n
        FROM analytics.conversation_offers o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {scope} AND o.response = 'accepted' AND o.technique <> 'generic'
          AND (o.amount IS NOT NULL OR o.category = 'loyalty')
        GROUP BY c.store_id
    """), params)).fetchall()
    revenue_by_store = {str(r.store_id): (float(r.revenue), int(r.n)) for r in revenue}
    revenue_total = sum(v[0] for v in revenue_by_store.values())
    revenue_n = sum(v[1] for v in revenue_by_store.values())

    techniques = (await db.execute(text(f"""
        SELECT o.technique, COUNT(*) AS offers, COUNT(*) FILTER (WHERE o.response = 'accepted') AS accepted
        FROM analytics.conversation_offers o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {scope}
        GROUP BY o.technique ORDER BY offers DESC
    """), params)).fetchall()

    items = (await db.execute(text(f"""
        SELECT LOWER(TRIM(o.item)) AS item, MIN(o.category) AS category,
               COUNT(*) AS offers, COUNT(*) FILTER (WHERE o.response = 'accepted') AS accepted
        FROM analytics.conversation_offers o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {scope}
        GROUP BY 1 ORDER BY offers DESC LIMIT 15
    """), params)).fetchall()

    categories = (await db.execute(text(f"""
        SELECT o.category, COUNT(*) AS offers, COUNT(*) FILTER (WHERE o.response = 'accepted') AS accepted
        FROM analytics.conversation_offers o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {scope}
        GROUP BY o.category ORDER BY offers DESC
    """), params)).fetchall()

    # По часам: в час пик бариста часто перестаёт предлагать — здесь это видно
    hours = (await db.execute(text(f"""
        SELECT EXTRACT(HOUR FROM COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz)::int AS hour,
               COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE {scope}
        GROUP BY 1 ORDER BY 1
    """), params)).fetchall()

    sellers = (await db.execute(text(f"""
        SELECT c.seller_id, c.store_id,
               TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS name,
               st.name AS store_name,
               COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer,
               COALESCE(SUM(c.offers_count), 0) AS offers,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted,
               COUNT(DISTINCT c.session_date) AS shifts
        FROM analytics.conversations c
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {scope}
        GROUP BY c.seller_id, c.store_id, s.first_name, s.last_name, st.name
        ORDER BY accepted DESC
    """), params)).fetchall()

    focus = (await db.execute(text(f"""
        SELECT LOWER(TRIM(o.item)) AS item, COUNT(*) AS offers,
               COUNT(*) FILTER (WHERE o.response = 'accepted') AS accepted
        FROM analytics.conversation_offers o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {scope} AND o.is_focus
        GROUP BY 1 ORDER BY offers DESC LIMIT 10
    """), params)).fetchall()

    # Ряд по дням и разбивка по точкам — для «Аналитики»: динамика и сравнение точек
    days = (await db.execute(text(f"""
        SELECT c.session_date AS day, COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer,
               COALESCE(SUM(c.offers_count), 0) AS offers,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted
        FROM analytics.conversations c
        WHERE {scope}
        GROUP BY 1 ORDER BY 1
    """), params)).fetchall()

    store_rows = (await db.execute(text(f"""
        SELECT c.store_id, st.name AS store_name, COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE COALESCE(c.offers_count, 0) > 0) AS with_offer,
               COALESCE(SUM(c.offers_count), 0) AS offers,
               COALESCE(SUM(c.offers_accepted), 0) AS accepted,
               AVG(c.check_total) FILTER (WHERE COALESCE(c.offers_accepted, 0) > 0) AS check_with,
               AVG(c.check_total) FILTER (WHERE COALESCE(c.offers_accepted, 0) = 0) AS check_without
        FROM analytics.conversations c
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {scope}
        GROUP BY c.store_id, st.name ORDER BY st.name
    """), params)).fetchall()
    stores_out = []
    for r in store_rows:
        plan = await resolve_plan(db, org_id, r.store_id, None)
        rate = _rate(r.with_offer, r.orders)
        stores_out.append({
            "store_id": str(r.store_id), "store_name": r.store_name, "orders": r.orders, "with_offer": r.with_offer,
            "attempt_rate": rate, "offers": int(r.offers), "accepted": int(r.accepted),
            "acceptance_rate": _rate(int(r.accepted), int(r.offers)),
            "avg_check_with_upsell": _num(r.check_with), "avg_check_without": _num(r.check_without),
            "upsell_revenue": _num(revenue_by_store.get(str(r.store_id), (None, 0))[0]) or None,
            "upsell_revenue_n": revenue_by_store.get(str(r.store_id), (0, 0))[1],
            "attempt_rate_target": plan["attempt_rate_target"],
            "plan_met": rate is not None and rate >= plan["attempt_rate_target"],
        })

    missed = (await db.execute(text(f"""
        SELECT c.id, c.session_date, c.order_items, c.offer_missed, c.offer_better_phrase,
               TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS seller_name
        FROM analytics.conversations c
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        WHERE {scope} AND COALESCE(c.offers_count, 0) = 0 AND c.offer_missed IS NOT NULL
        ORDER BY c.analyzed_at DESC LIMIT 10
    """), params)).fetchall()

    seller_rows = []
    for r in sellers:
        plan = await resolve_plan(db, org_id, r.store_id, r.seller_id)
        rate = _rate(r.with_offer, r.orders)
        seller_rows.append({
            "seller_id": str(r.seller_id),
            "name": r.name or None,
            "store_id": str(r.store_id),
            "store_name": r.store_name,
            "orders": r.orders,
            "shifts": r.shifts,
            "with_offer": r.with_offer,
            "attempt_rate": rate,
            "offers": int(r.offers),
            "accepted": int(r.accepted),
            "accepted_per_shift": round(int(r.accepted) / r.shifts, 1) if r.shifts else None,
            "acceptance_rate": _rate(int(r.accepted), int(r.offers)),
            "attempt_rate_target": plan["attempt_rate_target"],
            "plan_met": rate is not None and rate >= plan["attempt_rate_target"],
        })

    orders_n = int(totals.orders or 0)
    check_with, check_without = _num(totals.check_with), _num(totals.check_without)
    return {
        "period": {"from": str(date_from), "to": str(date_to)},
        "totals": {
            "orders": orders_n,
            "with_offer": int(totals.with_offer or 0),
            "attempt_rate": _rate(int(totals.with_offer or 0), orders_n),
            "offers": int(totals.offers),
            "accepted": int(totals.accepted),
            "acceptance_rate": _rate(int(totals.accepted), int(totals.offers)),
            "avg_check_with_upsell": check_with,
            "avg_check_without": check_without,
            # Разница среднего чека с принятой допродажей и без: аргумент «сколько это денег»
            "check_uplift": round(check_with - check_without, 2) if check_with and check_without else None,
            "checks_known": int(totals.checks_known or 0),
            "checks_with_n": int(totals.checks_with_n or 0),
            "checks_without_n": int(totals.checks_without_n or 0),
            "avg_check": _num(totals.avg_check),
            "upsell_revenue": _num(revenue_total) if revenue_total else None,
            "upsell_revenue_n": revenue_n,
        },
        "techniques": [
            {"technique": t.technique, "label": TECHNIQUE_LABELS.get(t.technique, t.technique),
             "offers": t.offers, "accepted": t.accepted, "acceptance_rate": _rate(t.accepted, t.offers)}
            for t in techniques
        ],
        "categories": [
            {"category": c.category, "offers": c.offers, "accepted": c.accepted,
             "acceptance_rate": _rate(c.accepted, c.offers)}
            for c in categories
        ],
        "items": [
            {"item": i.item, "category": i.category, "offers": i.offers, "accepted": i.accepted,
             "acceptance_rate": _rate(i.accepted, i.offers)}
            for i in items
        ],
        "hours": [
            {"hour": h.hour, "orders": h.orders, "attempt_rate": _rate(h.with_offer, h.orders),
             "accepted": int(h.accepted)}
            for h in hours
        ],
        "focus": [
            {"item": f.item, "offers": f.offers, "accepted": f.accepted,
             "acceptance_rate": _rate(f.accepted, f.offers)}
            for f in focus
        ],
        "sellers": seller_rows,
        "days": [
            {"date": str(d.day), "orders": d.orders, "with_offer": d.with_offer, "attempt_rate": _rate(d.with_offer, d.orders),
             "offers": int(d.offers), "accepted": int(d.accepted), "acceptance_rate": _rate(int(d.accepted), int(d.offers))}
            for d in days
        ],
        "stores": stores_out,
        "plan": await resolve_plan(db, org_id, store_id, None),
        "missed": [
            {"conversation_id": str(m.id), "session_date": str(m.session_date), "seller_name": m.seller_name or None,
             "items": m.order_items or [], "missed": m.offer_missed, "better_phrase": m.offer_better_phrase}
            for m in missed
        ],
    }


# ─── План смены ──────────────────────────────────────────────────────────────

class PlanUpsert(BaseModel):
    store_id: uuid.UUID | None = None
    seller_id: uuid.UUID | None = None
    attempt_rate_target: float | None = Field(default=None, ge=0, le=1)
    accepted_per_shift: int | None = Field(default=None, ge=0, le=1000)
    focus_items: list[str] = Field(default_factory=list, max_length=10)


def _plan_row(r) -> dict:
    return {
        "id": str(r.id),
        "store_id": str(r.store_id) if r.store_id else None,
        "seller_id": str(r.seller_id) if r.seller_id else None,
        "attempt_rate_target": float(r.attempt_rate_target) if r.attempt_rate_target is not None else None,
        "accepted_per_shift": r.accepted_per_shift,
        "focus_items": list(r.focus_items or []),
        "updated_at": r.updated_at,
    }


@router.get("/upsell/plans")
async def list_plans(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Все планы организации (организация, магазины, сотрудники) в зоне доступа пользователя."""
    org_id, _ = org_store_conditions(user)
    rows = (await db.execute(text("""
        SELECT id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items, updated_at
        FROM analytics.upsell_plans WHERE organization_id = :org_id
        ORDER BY (store_id IS NOT NULL), (seller_id IS NOT NULL), updated_at
    """), {"org_id": uuid.UUID(org_id)})).fetchall()
    allowed = _allowed_stores(user)
    items = [_plan_row(r) for r in rows
             if allowed is None or r.store_id is None or str(r.store_id) in allowed]
    return {"items": items, "default_attempt_rate_target": DEFAULT_ATTEMPT_RATE_TARGET}


@router.put("/upsell/plans")
async def upsert_plan(
    body: PlanUpsert,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Создаёт или обновляет план на уровне организации, магазина или сотрудника.
    План организации меняют director и admin; магазина и сотрудника — ещё и РОП/менеджер своей точки."""
    org_id = uuid.UUID(user["organization_id"])
    store_id = body.store_id
    if body.seller_id:
        seller = await _seller_or_404(db, user, body.seller_id)
        store_id = seller.store_id
    if store_id is None:
        if user.get("role") not in ("director", "admin"):
            raise HTTPException(status_code=403, detail="Only director/admin can set the organization plan")
    else:
        _check_store(user, store_id)
        exists = (await db.execute(text(
            "SELECT 1 FROM admin_schema.stores WHERE id = :id AND organization_id = :org_id"
        ), {"id": store_id, "org_id": org_id})).scalar()
        if not exists:
            raise HTTPException(status_code=404, detail="Store not found")

    focus = [f.strip()[:100] for f in body.focus_items if f and f.strip()]
    row = (await db.execute(text("""
        INSERT INTO analytics.upsell_plans
            (organization_id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items,
             updated_by, updated_at)
        VALUES (:org_id, :store_id, :seller_id, :rate, :accepted, :focus, :user_id, now())
        ON CONFLICT (organization_id,
                     COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
                     COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET attempt_rate_target = EXCLUDED.attempt_rate_target,
                      accepted_per_shift = EXCLUDED.accepted_per_shift,
                      focus_items = EXCLUDED.focus_items,
                      updated_by = EXCLUDED.updated_by, updated_at = now()
        RETURNING id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items, updated_at
    """), {
        "org_id": org_id, "store_id": store_id, "seller_id": body.seller_id,
        "rate": body.attempt_rate_target, "accepted": body.accepted_per_shift, "focus": focus,
        "user_id": uuid.UUID(user["sub"]) if user.get("sub") else None,
    })).fetchone()
    await db.commit()
    return _plan_row(row)


@router.delete("/upsell/plans/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = uuid.UUID(user["organization_id"])
    row = (await db.execute(text(
        "SELECT store_id FROM analytics.upsell_plans WHERE id = :id AND organization_id = :org_id"
    ), {"id": plan_id, "org_id": org_id})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found")
    if row.store_id is None and user.get("role") not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only director/admin can remove the organization plan")
    if row.store_id is not None:
        _check_store(user, row.store_id)
    await db.execute(text("DELETE FROM analytics.upsell_plans WHERE id = :id"), {"id": plan_id})
    await db.commit()
