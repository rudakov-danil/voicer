"""Данные экрана «Аналитика» по концепту (ui-concept/analytics.html):
что влияет на покупку, где уходят покупатели, нагрузка по часам,
что отвечают на «дорого» и доля речи продавцов против конверсии."""
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings
from app.routers.home import SELL_NEED, SELL_DONE

router = APIRouter(prefix="/api/v1/dashboard/insights", tags=["insights"])

# Доля речи продавца: сумма длительностей его реплик к речи продавца и покупателя
_TALK_CTE = """
    talk AS (
        SELECT c.id,
               SUM(CASE WHEN LOWER(ts.speaker_role) = 'seller' THEN ts.end_ms - ts.start_ms ELSE 0 END)::float AS s,
               SUM(CASE WHEN LOWER(ts.speaker_role) IN ('customer', 'client') THEN ts.end_ms - ts.start_ms ELSE 0 END)::float AS cu
        FROM analytics.conversations c
        JOIN transcription.transcript_segments ts ON ts.transcript_id = c.transcript_id
        WHERE {scope} AND ts.end_ms > ts.start_ms
        GROUP BY c.id
    )
"""

# Ответы на «дорого»: техника из анализа — свободный текст, группируем по ключевым словам.
# Порядок важен: первое совпадение решает.
PRICE_ANSWERS: list[tuple[str, tuple[str, ...]]] = [
    ("Трейд-ин", ("трейд", "trade")),
    ("Рассрочка или кредит", ("рассроч", "кредит", "financ", "installment")),
    ("Скидка", ("скидк", "discount")),
    ("Подарок или комплект", ("подар", "комплект", "бонус", "gift")),
    ("Вариант подешевле", ("альтернатив", "дешевл", "сокращ", "уменьш", "эконом")),
    ("Ценность и сравнение", ("ценност", "сравн", "окупаем", "roi", "выгод", "экономи")),
]


def _price_answer(technique: str | None, resolved: bool) -> str:
    low = (technique or "").lower()
    if not resolved and not low.strip():
        return "Нет ответа"
    for label, keys in PRICE_ANSWERS:
        if any(k in low for k in keys):
            return label
    return "Другое" if low.strip() else "Нет ответа"


def _scope(user: dict, store_id, days: int) -> tuple[str, dict]:
    org_id, forced_store_id = org_store_conditions(user)
    effective = forced_store_id or store_id
    date_to = date.today()
    params: dict = {"org_id": uuid.UUID(org_id), "date_from": date_to - timedelta(days=days), "date_to": date_to}
    scope = "c.organization_id = :org_id AND c.session_date BETWEEN :date_from AND :date_to AND c.is_scorable"
    if effective:
        scope += " AND c.store_id = :store_id"
        params["store_id"] = effective
    return scope, params


def _rate(purchases: int, total: int) -> float | None:
    return round(purchases / total * 100, 1) if total else None


@router.get("")
async def get_insights(
    period: int = Query(default=30, ge=1, le=365),
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    scope, params = _scope(user, store_id, period)
    params["tz"] = settings.LOCAL_TZ

    # ─── Что влияет на покупку: конверсия при выполненном и невыполненном условии ───
    flags = (await db.execute(text(f"""
        WITH {_TALK_CTE.format(scope=scope)}
        SELECT c.id, c.outcome = 'purchase' AS won,
               CASE WHEN t.s + t.cu > 0 THEN t.s / (t.s + t.cu) END AS talk_share,
               EXISTS(SELECT 1 FROM analytics.objections o WHERE o.conversation_id = c.id AND o.type = 'price') AS has_price,
               NOT EXISTS(SELECT 1 FROM analytics.objections o WHERE o.conversation_id = c.id AND o.type = 'price' AND o.is_resolved IS NOT TRUE) AS price_handled,
               {SELL_NEED} AS sell_need,
               {SELL_DONE} AS sell_done,
               EXISTS(SELECT 1 FROM analytics.conversation_compliance_violations v WHERE v.conversation_id = c.id) AS has_violation
        FROM analytics.conversations c
        LEFT JOIN talk t ON t.id = c.id
        WHERE {scope}
    """), params)).fetchall()

    def driver(key: str, label: str, rows, cond):
        yes = [r for r in rows if cond(r)]
        no = [r for r in rows if not cond(r)]
        if len(yes) < 2 or len(no) < 2:
            return None
        a, b = _rate(sum(r.won for r in yes), len(yes)), _rate(sum(r.won for r in no), len(no))
        return {"key": key, "label": label, "with": a, "without": b, "diff": round(a - b, 1),
                "share": round(len(yes) / len(rows) * 100), "n": len(rows)}

    talked = [r for r in flags if r.talk_share is not None]
    drivers = [d for d in (
        driver("talk", "Продавец говорит не больше 60 % времени", talked, lambda r: r.talk_share <= 0.6),
        driver("price", "На «дорого» ответили по существу", [r for r in flags if r.has_price], lambda r: r.price_handled),
        driver("upsell", "Предложили допродажу по правилу", [r for r in flags if r.sell_need], lambda r: r.sell_done),
        driver("clean", "Обошлось без нарушений", flags, lambda r: not r.has_violation),
    ) if d]

    # Этапы основного скрипта: выполнен (балл 50+) или нет
    tpl = (await db.execute(text(f"""
        SELECT cs.script_template_id AS id, COUNT(DISTINCT cs.conversation_id) AS n
        FROM analytics.conversation_scores cs JOIN analytics.conversations c ON c.id = cs.conversation_id
        WHERE {scope} GROUP BY 1 ORDER BY n DESC LIMIT 1
    """), params)).fetchone()
    funnel = None
    if tpl:
        params["tpl"] = tpl.id
        score_rows = (await db.execute(text(f"""
            SELECT c.id, c.outcome = 'purchase' AS won, cs.step_name, cs.score >= 50 AND cs.step_detected AS passed,
                   ss.step_order AS current_order, ss_old.step_order AS old_order,
                   COALESCE(ss.recommendation_text, ss.description) AS hint
            FROM analytics.conversation_scores cs
            JOIN analytics.conversations c ON c.id = cs.conversation_id
            LEFT JOIN scripts.script_steps ss ON ss.template_id = cs.script_template_id AND ss.name = cs.step_name
            LEFT JOIN scripts.script_steps ss_old ON ss_old.id = cs.script_step_id
            WHERE {scope} AND cs.script_template_id = :tpl
        """), params)).fetchall()
        # Этапы текущей версии скрипта; если их нет в оценках — этапы, как их оценивали
        current = [r for r in score_rows if r.current_order is not None] or score_rows
        order_of: dict = {}
        for r in current:
            o = r.current_order if r.current_order is not None else r.old_order
            if o is not None:
                order_of[r.step_name] = min(order_of.get(r.step_name, o), o)
        steps = sorted({r.step_name for r in current}, key=lambda n: (order_of.get(n, 999), n))
        hints = {r.step_name: r.hint for r in current}
        by_conv: dict = {}
        for r in current:
            c = by_conv.setdefault(r.id, {"won": r.won, "steps": {}})
            c["steps"][r.step_name] = r.passed
        for name in steps:
            d = driver(f"step:{name}", f"Этап «{name}» выполнен",
                       [type("R", (), {"won": c["won"], "ok": c["steps"].get(name, False)}) for c in by_conv.values()],
                       lambda r: r.ok)
            if d:
                drivers.append(d)

        # Где уходят покупатели: сколько разговоров прошли все этапы до текущего включительно
        reached = []
        alive = list(by_conv.values())
        for name in steps:
            nxt = [c for c in alive if c["steps"].get(name, False)]
            reached.append({"step": name, "count": len(nxt), "lost": len(alive) - len(nxt), "hint": hints.get(name)})
            alive = nxt
        funnel = {
            "total": len(by_conv),
            "steps": reached,
            "purchases": sum(1 for c in by_conv.values() if c["won"]),
            "purchases_after_all_steps": sum(1 for c in alive if c["won"]),
        }

    # Условия без разницы в конверсии ничего не объясняют
    drivers = sorted((d for d in drivers if abs(d["diff"]) >= 1), key=lambda d: -abs(d["diff"]))

    # ─── Нагрузка по часам: разговоров в час в среднем за неделю ───
    hourly_rows = (await db.execute(text(f"""
        SELECT EXTRACT(ISODOW FROM (COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz))::int AS dow,
               EXTRACT(HOUR FROM (COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz))::int AS hour,
               COUNT(*) AS n, COUNT(*) FILTER (WHERE c.outcome = 'purchase') AS won
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE {scope}
        GROUP BY 1, 2
    """), params)).fetchall()
    weeks = max(1, period / 7)
    hourly = [{"dow": r.dow, "hour": r.hour, "count": r.n, "per_week": round(r.n / weeks, 1), "conversion": _rate(r.won, r.n)}
              for r in hourly_rows]

    # ─── Что отвечают на «дорого» ───
    price_rows = (await db.execute(text(f"""
        SELECT c.id, c.outcome = 'purchase' AS won, o.is_resolved, o.resolution_technique
        FROM analytics.objections o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE {scope} AND o.type = 'price'
    """), params)).fetchall()
    answers: dict = {}
    for r in price_rows:
        label = _price_answer(r.resolution_technique, bool(r.is_resolved))
        a = answers.setdefault(label, {"label": label, "times": 0, "conversations": set(), "won": set()})
        a["times"] += 1
        a["conversations"].add(r.id)
        if r.won:
            a["won"].add(r.id)
    price_answers = sorted(
        ({"label": a["label"], "times": a["times"], "conversations": len(a["conversations"]),
          "conversion": _rate(len(a["won"]), len(a["conversations"]))} for a in answers.values()),
        key=lambda a: -(a["conversion"] or 0),
    )

    # ─── Кто больше говорит: доля речи и конверсия по продавцам ───
    talk_rows = (await db.execute(text(f"""
        WITH {_TALK_CTE.format(scope=scope)}
        SELECT c.seller_id, TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS name,
               SUM(t.s) / NULLIF(SUM(t.s + t.cu), 0) AS share,
               COUNT(*) AS n, COUNT(*) FILTER (WHERE c.outcome = 'purchase') AS won
        FROM analytics.conversations c
        JOIN talk t ON t.id = c.id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        WHERE {scope}
        GROUP BY c.seller_id, s.first_name, s.last_name
    """), params)).fetchall()
    talk = [{"seller_id": r.seller_id, "name": r.name or None, "talk_share": round(float(r.share) * 100, 1),
             "conversations": r.n, "conversion": _rate(r.won, r.n)}
            for r in talk_rows if r.share is not None]

    return {
        "period": period,
        "timezone": settings.LOCAL_TZ,
        "drivers": drivers[:5],
        "funnel": funnel,
        "hourly": hourly,
        "price_answers": price_answers,
        "talk": talk,
    }
