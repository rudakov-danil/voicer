"""Советы сотруднику по его разговорам — для экрана «Моя смена» (мобильное приложение).

LLM смотрит разбор допродаж за смену (что предлагал, какими словами, как реагировали
клиенты, где не предложил ничего) и пишет 2–3 конкретных совета с готовыми фразами.
Результат кэшируется на день в analytics.seller_tips и пересчитывается, только когда
появились новые разговоры — экран можно обновлять сколько угодно, LLM не дёргается зря.
"""
import json
import hashlib
from typing import Literal
import logging
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_mobile_user
from app.llm_client import get_llm_client
from app.prompt_builder import build_tips_prompt, industry_words
from app.response_parser import parse_tips_response

router = APIRouter(prefix="/api/v1/analytics", tags=["coach"])
logger = logging.getLogger(__name__)

# Приёмы — словами, а не кодами: иначе в текст для человека попадает «specific»
TECHNIQUE_RU = {"generic": "«что-нибудь ещё?»", "specific": "конкретный товар без пояснения", "choice": "выбор из двух",
                "benefit": "с объяснением пользы", "promo": "акция или комбо"}

# Меньше разговоров за день — советы строим по последним 7 дням, иначе выводы случайны
MIN_CONVERSATIONS_FOR_DAY = 3
MAX_EXAMPLES = 25


async def _seller_or_404(db: AsyncSession, user: dict, seller_id: uuid.UUID):
    row = (await db.execute(text("""
        SELECT id, store_id, first_name FROM admin_schema.sellers
        WHERE id = :seller_id AND organization_id = :org_id
    """), {"seller_id": seller_id, "org_id": uuid.UUID(user["organization_id"])})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Seller not found")
    if user.get("role") == "employee" and str(seller_id) != user.get("seller_id"):
        raise HTTPException(404, "Seller not found")
    role = user.get("role")
    store = str(row.store_id)
    if role == "manager" and store != str(user.get("store_id")):
        raise HTTPException(status_code=404, detail="Seller not found")
    if role == "rop" and store not in [str(s) for s in user.get("rop_stores", [])]:
        raise HTTPException(status_code=404, detail="Seller not found")
    return row


async def _conversations(db: AsyncSession, org_id: uuid.UUID, seller_id: uuid.UUID,
                         date_from: date, date_to: date) -> list:
    return (await db.execute(text("""
        SELECT c.id, c.analyzed_at, c.order_items, c.offer_missed, c.offer_better_phrase,
               c.offers_count, c.offers_accepted
        FROM analytics.conversations c
        WHERE c.organization_id = :org_id AND c.seller_id = :seller_id
          AND c.session_date BETWEEN :date_from AND :date_to
          AND c.offer_opportunity IS TRUE
        ORDER BY c.analyzed_at DESC
    """), {"org_id": org_id, "seller_id": seller_id, "date_from": date_from, "date_to": date_to})).fetchall()


async def _focus_items(db: AsyncSession, org_id: uuid.UUID, store_id, seller_id: uuid.UUID) -> list[str]:
    row = (await db.execute(text("""
        SELECT focus_items FROM analytics.upsell_plans
        WHERE organization_id = :org_id
          AND (store_id IS NULL OR store_id = :store_id)
          AND (seller_id IS NULL OR seller_id = :seller_id)
        ORDER BY (seller_id IS NOT NULL) DESC, (store_id IS NOT NULL) DESC
        LIMIT 1
    """), {"org_id": org_id, "store_id": store_id, "seller_id": seller_id})).fetchone()
    return [f for f in (row.focus_items or []) if f] if row else []


@router.post("/sellers/{seller_id}/tips")
async def seller_tips(
    seller_id: uuid.UUID,
    day: date | None = None,
    force: bool = False,
    audience: Literal["manager", "employee"] = "manager",
    user: dict = Depends(get_mobile_user),
    db: AsyncSession = Depends(get_db),
):
    """Советы сотруднику на смену. Кэш на день; новые разговоры → пересчёт.

    Ответ: {tips: {praise, focus, tips: [{title, text, phrase}]} | null, period, based_on, cached}.
    tips=null — разобранных заказов пока нет.
    """
    if user.get("role") == "employee":
        audience = "employee"
    seller = await _seller_or_404(db, user, seller_id)
    org_id = uuid.UUID(user["organization_id"])
    day = day or date.today()

    period = "day"
    convs = await _conversations(db, org_id, seller_id, day, day)
    if len(convs) < MIN_CONVERSATIONS_FOR_DAY:
        period = "week"
        convs = await _conversations(db, org_id, seller_id, day - timedelta(days=6), day)
    if not convs:
        return {"tips": None, "period": period, "based_on": 0, "cached": False}

    cached = (await db.execute(text("""
        SELECT tips, conversations_count, generated_at FROM analytics.seller_tips
        WHERE seller_id = :seller_id AND tip_date = :day AND audience = :audience
    """), {"seller_id": seller_id, "day": day, "audience": audience})).fetchone()
    # Prepared synthetic examples make the demo immediately reviewable. Any new
    # conversation invalidates them. Ordinary organisations still use fingerprinted LLM tips.
    if cached and not force and cached.conversations_count == len(convs) and cached.tips.get("_demo_seed") == "coffee-shop-motivation-v1":
        slug = (await db.execute(text("SELECT slug FROM auth.organizations WHERE id=:id"), {"id":org_id})).scalar()
        if slug == "horeca-demo":
            return {"tips":cached.tips,"period":period,"based_on":len(convs),"cached":True,
                    "generated_at":cached.generated_at,"audience":audience,"is_demo":True}
    ids = [c.id for c in convs[:MAX_EXAMPLES]]
    offer_rows = (await db.execute(text("""
        SELECT conversation_id, item, technique, response, is_focus, quote, customer_quote
        FROM analytics.conversation_offers
        WHERE conversation_id = ANY(:ids)
        ORDER BY sort_order
    """), {"ids": ids})).fetchall()
    by_conv: dict = {}
    for o in offer_rows:
        by_conv.setdefault(o.conversation_id, []).append(o)

    all_offers = (await db.execute(text("""
        SELECT o.technique, o.response, COUNT(*) AS n
        FROM analytics.conversation_offers o
        WHERE o.conversation_id = ANY(:ids)
        GROUP BY o.technique, o.response
    """), {"ids": [c.id for c in convs]})).fetchall()
    techniques: dict = {}
    for r in all_offers:
        t = techniques.setdefault(TECHNIQUE_RU.get(r.technique, r.technique), {"предложений": 0, "принято": 0})
        t["предложений"] += r.n
        if r.response == "accepted":
            t["принято"] += r.n

    industry = None
    try:
        industry = (await db.execute(text(
            "SELECT industry FROM auth.organizations WHERE id = :org_id"
        ), {"org_id": org_id})).scalar()
    except Exception:
        await db.rollback()
    # Слова отрасли и в данных: в аптеке «покупок», а не «заказов» — иначе модель пишет «заказ» и «гость»
    w = industry_words(industry)
    with_offer = sum(1 for c in convs if (c.offers_count or 0) > 0)
    stats = {
        "период": "сегодня" if period == "day" else "последние 7 дней",
        w["orders_gen"]: len(convs),
        f"{w['orders_gen']}_с_предложением": with_offer,
        "принятых_допродаж": sum(c.offers_accepted or 0 for c in convs),
        "по_приёмам": techniques,
    }
    examples = []
    for i, c in enumerate(convs[:MAX_EXAMPLES], 1):
        examples.append({
            "№": i,
            w["order"]: c.order_items or [],
            "предложения": [
                {"что": o.item, "приём": TECHNIQUE_RU.get(o.technique, o.technique), "реакция": o.response,
                 "фраза": o.quote, "ответ_клиента": o.customer_quote, "товар_дня": o.is_focus}
                for o in by_conv.get(c.id, [])
            ],
            "упущено": c.offer_missed,
        })

    focus = await _focus_items(db, org_id, seller.store_id, seller_id)

    system, user_prompt = build_tips_prompt(stats, examples, industry, focus, audience, seller.first_name)
    fingerprint = hashlib.sha256((system + user_prompt).encode()).hexdigest()
    if cached and not force and cached.tips.get("_fingerprint") == fingerprint:
        return {"tips":cached.tips,"period":period,"based_on":len(convs),"cached":True,
                "generated_at":cached.generated_at,"audience":audience}
    try:
        response = await get_llm_client().chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
            timeout=settings.LLM_GENERAL_TIMEOUT,
        )
        parsed = parse_tips_response(response.choices[0].message.content)
    except Exception as e:
        logger.error("Tips generation failed for seller %s: %s", seller_id, e)
        if cached and cached.tips.get("_fingerprint"):
            # Старые советы лучше пустого экрана
            return {"tips": cached.tips, "period": cached.tips.get("_period", period),
                    "based_on": cached.conversations_count, "cached": True, "stale": True,
                    "generated_at": cached.generated_at}
        raise HTTPException(status_code=502, detail="Не удалось подготовить советы. Попробуйте позже.")

    tips = parsed.model_dump()
    tips["_period"] = period
    tips["_fingerprint"] = fingerprint
    now = datetime.utcnow()
    await db.execute(text("""
        INSERT INTO analytics.seller_tips (organization_id, seller_id, tip_date, conversations_count, tips, generated_at, audience)
        VALUES (:org_id, :seller_id, :day, :n, CAST(:tips AS JSONB), :now, :audience)
        ON CONFLICT (seller_id, tip_date, audience) DO UPDATE
        SET conversations_count = EXCLUDED.conversations_count, tips = EXCLUDED.tips,
            generated_at = EXCLUDED.generated_at
    """), {"org_id": org_id, "seller_id": seller_id, "day": day, "n": len(convs),
           "tips": json.dumps(tips, ensure_ascii=False), "now": now, "audience": audience})
    await db.commit()
    return {"tips": tips, "period": period, "based_on": len(convs), "cached": False, "generated_at": now}
