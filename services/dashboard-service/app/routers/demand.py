"""Спрос: что покупатели просили, а этого не оказалось, — и список к закупке.

Данные — разбор разговоров (analytics-engine, миграция 0012):
  analytics.conversation_demand — просьба покупателя: товар, причина (закончился / не держим),
    исход (купил аналог / заказали под покупателя / ушёл без покупки), цитаты обеих сторон;
  analytics.demand_items — решение руководителя по позиции: в закупку, заказано, не закупаем.

Позиция = item_key (нормализованное название, см. response_parser.demand_key): «Нурофен Экспресс
200мг» и «нурофен экспресс 200 мг» — одна строка списка.
"""
import csv
import io
import uuid
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.org_settings import org_tz
from app.routers.upsell import _allowed_stores, _check_store

router = APIRouter(prefix="/api/v1/dashboard", tags=["demand"])

Status = Literal["new", "to_order", "ordered", "ignored"]
STATUS_LABELS = {"new": "Новое", "to_order": "В закупку", "ordered": "Заказано", "ignored": "Не закупаем"}
OUTCOME_LABELS = {"substituted": "купил аналог", "ordered": "заказали под покупателя", "lost": "ушёл без покупки",
                  "unknown": "неясно"}


def _scope(user: dict, store_id, date_from: date, date_to: date) -> tuple[str, dict]:
    params: dict = {"org_id": uuid.UUID(user["organization_id"]), "date_from": date_from, "date_to": date_to}
    scope = "c.organization_id = :org_id AND c.session_date BETWEEN :date_from AND :date_to"
    allowed = _allowed_stores(user)
    if store_id:
        _check_store(user, store_id)
        scope += " AND c.store_id = :store_id"
        params["store_id"] = store_id
    elif allowed is not None:
        scope += " AND c.store_id = ANY(CAST(:stores AS uuid[]))"
        params["stores"] = allowed
    return scope, params


async def _items(db: AsyncSession, scope: str, params: dict) -> list[dict]:
    """Позиции спроса за период с решениями руководителя. Позиции «в закупку» и «заказано»
    остаются в списке, даже если за период их больше не спрашивали, — это и есть список закупки."""
    rows = (await db.execute(text(f"""
        SELECT d.item_key,
               MODE() WITHIN GROUP (ORDER BY d.item) AS title,
               MODE() WITHIN GROUP (ORDER BY d.category) AS category,
               COUNT(*) AS requests,
               COUNT(*) FILTER (WHERE d.outcome = 'lost') AS lost,
               COUNT(*) FILTER (WHERE d.outcome = 'substituted') AS substituted,
               COUNT(*) FILTER (WHERE d.outcome = 'ordered') AS ordered,
               COUNT(*) FILTER (WHERE d.reason = 'not_carried') AS not_carried,
               COUNT(*) FILTER (WHERE c.session_date > CAST(:date_to AS date) - 7) AS last7,
               COUNT(*) FILTER (WHERE c.session_date <= CAST(:date_to AS date) - 7
                                  AND c.session_date > CAST(:date_to AS date) - 14) AS prev7,
               MAX(COALESCE(r.started_at, c.analyzed_at)) AS last_at
        FROM analytics.conversation_demand d
        JOIN analytics.conversations c ON c.id = d.conversation_id
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE {scope}
        GROUP BY d.item_key
        ORDER BY requests DESC, last_at DESC
        LIMIT 300
    """), params)).fetchall()

    stores = (await db.execute(text(f"""
        SELECT d.item_key, c.store_id, st.name AS store_name, COUNT(*) AS requests
        FROM analytics.conversation_demand d
        JOIN analytics.conversations c ON c.id = d.conversation_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {scope}
        GROUP BY 1, 2, 3
    """), params)).fetchall()
    analogs = (await db.execute(text(f"""
        SELECT d.item_key, MODE() WITHIN GROUP (ORDER BY d.analog) AS analog, LOWER(TRIM(d.analog)) AS k,
               COUNT(*) AS offered, COUNT(*) FILTER (WHERE d.outcome = 'substituted') AS taken
        FROM analytics.conversation_demand d
        JOIN analytics.conversations c ON c.id = d.conversation_id
        WHERE {scope} AND d.analog IS NOT NULL AND TRIM(d.analog) <> ''
        GROUP BY d.item_key, LOWER(TRIM(d.analog))
    """), params)).fetchall()
    decisions = (await db.execute(text("""
        SELECT item_key, title, status, note, updated_at
        FROM analytics.demand_items WHERE organization_id = :org_id
    """), {"org_id": params["org_id"]})).fetchall()

    by_store: dict[str, list] = {}
    for s in stores:
        by_store.setdefault(s.item_key, []).append(
            {"store_id": str(s.store_id), "store_name": s.store_name, "requests": int(s.requests)})
    by_analog: dict[str, list] = {}
    for a in analogs:
        by_analog.setdefault(a.item_key, []).append({"name": a.analog, "offered": int(a.offered), "taken": int(a.taken)})
    decided = {d.item_key: d for d in decisions}

    out: list[dict] = []
    for r in rows:
        d = decided.get(r.item_key)
        out.append({
            "key": r.item_key,
            "title": r.title,
            "category": r.category,
            "requests": int(r.requests),
            "lost": int(r.lost),
            "substituted": int(r.substituted),
            "ordered": int(r.ordered),
            "not_carried": int(r.not_carried),
            "last7": int(r.last7),
            "prev7": int(r.prev7),
            "last_at": r.last_at.isoformat() if r.last_at else None,
            "stores": sorted(by_store.get(r.item_key, []), key=lambda x: -x["requests"]),
            "analogs": sorted(by_analog.get(r.item_key, []), key=lambda x: (-x["taken"], -x["offered"]))[:3],
            "status": d.status if d else "new",
            "note": d.note if d else None,
            "decided_at": d.updated_at.isoformat() if d else None,
        })
    seen = {x["key"] for x in out}
    for d in decisions:
        if d.item_key not in seen and d.status in ("to_order", "ordered"):
            out.append({
                "key": d.item_key, "title": d.title, "category": "other", "requests": 0, "lost": 0, "substituted": 0,
                "ordered": 0, "not_carried": 0, "last7": 0, "prev7": 0, "last_at": None, "stores": [], "analogs": [],
                "status": d.status, "note": d.note, "decided_at": d.updated_at.isoformat(),
            })
    return out


@router.get("/demand")
async def demand_overview(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Неудовлетворённый спрос за период: итоги, позиции с решениями, динамика и последние просьбы."""
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=29)
    scope, params = _scope(user, store_id, date_from, date_to)
    params["tz"] = await org_tz(db, params["org_id"])

    totals = (await db.execute(text(f"""
        SELECT COUNT(*) AS requests,
               COUNT(DISTINCT d.item_key) AS items,
               COUNT(DISTINCT d.conversation_id) AS conversations,
               COUNT(*) FILTER (WHERE d.outcome = 'lost') AS lost,
               COUNT(*) FILTER (WHERE d.outcome = 'substituted') AS substituted,
               COUNT(*) FILTER (WHERE d.outcome = 'ordered') AS ordered
        FROM analytics.conversation_demand d
        JOIN analytics.conversations c ON c.id = d.conversation_id
        WHERE {scope}
    """), params)).fetchone()
    all_conversations = (await db.execute(text(f"""
        SELECT COUNT(*) FROM analytics.conversations c WHERE {scope}
    """), params)).scalar() or 0
    days = (await db.execute(text(f"""
        SELECT c.session_date AS day, COUNT(*) AS requests,
               COUNT(*) FILTER (WHERE d.outcome = 'lost') AS lost
        FROM analytics.conversation_demand d
        JOIN analytics.conversations c ON c.id = d.conversation_id
        WHERE {scope}
        GROUP BY 1 ORDER BY 1
    """), params)).fetchall()
    recent = (await db.execute(text(f"""
        SELECT c.id AS conversation_id, c.session_date,
               to_char(COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz, 'HH24:MI') AS hhmm,
               st.name AS store_name,
               TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS seller_name,
               d.item, d.item_key, d.reason, d.outcome, d.analog, d.quote, d.seller_quote
        FROM analytics.conversation_demand d
        JOIN analytics.conversations c ON c.id = d.conversation_id
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        WHERE {scope}
        ORDER BY COALESCE(r.started_at, c.analyzed_at) DESC
        LIMIT 300
    """), params)).fetchall()

    items = await _items(db, scope, params)
    return {
        "period": {"from": str(date_from), "to": str(date_to)},
        "totals": {
            "requests": int(totals.requests or 0),
            "items": int(totals.items or 0),
            "conversations": int(totals.conversations or 0),
            "all_conversations": int(all_conversations),
            "lost": int(totals.lost or 0),
            "substituted": int(totals.substituted or 0),
            "ordered": int(totals.ordered or 0),
            "to_order": sum(1 for x in items if x["status"] == "to_order"),
        },
        "days": [{"date": str(d.day), "requests": int(d.requests), "lost": int(d.lost)} for d in days],
        "items": items,
        "recent": [
            {"conversation_id": str(x.conversation_id), "session_date": str(x.session_date), "time": x.hhmm,
             "store_name": x.store_name, "seller_name": x.seller_name or None, "item": x.item, "key": x.item_key,
             "reason": x.reason, "outcome": x.outcome, "analog": x.analog, "quote": x.quote, "seller_quote": x.seller_quote}
            for x in recent
        ],
    }


class DemandDecision(BaseModel):
    key: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    status: Status
    note: str | None = Field(default=None, max_length=1000)


@router.put("/demand/items")
async def save_demand_decision(
    body: DemandDecision,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Решение по позиции: в закупку, заказано, не закупаем или снова «новое»."""
    if user.get("role") not in ("director", "admin", "rop", "manager"):
        raise HTTPException(status_code=403, detail="Not allowed")
    note = (body.note or "").strip() or None
    row = (await db.execute(text("""
        INSERT INTO analytics.demand_items (organization_id, item_key, title, status, note, updated_by, updated_at)
        VALUES (:org_id, :key, :title, :status, :note, :user_id, now())
        ON CONFLICT (organization_id, item_key) DO UPDATE
            SET title = EXCLUDED.title, status = EXCLUDED.status, note = EXCLUDED.note,
                updated_by = EXCLUDED.updated_by, updated_at = now()
        RETURNING item_key, title, status, note, updated_at
    """), {"org_id": uuid.UUID(user["organization_id"]), "key": body.key, "title": body.title.strip(),
           "status": body.status, "note": note, "user_id": uuid.UUID(user["sub"]) if user.get("sub") else None})).fetchone()
    await db.commit()
    return {"key": row.item_key, "title": row.title, "status": row.status, "note": row.note,
            "decided_at": row.updated_at.isoformat()}


@router.get("/demand/export")
async def export_demand(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: Status | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Список к закупке в CSV для Excel: точка с запятой, UTF-8 с BOM."""
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=29)
    scope, params = _scope(user, store_id, date_from, date_to)
    items = await _items(db, scope, params)
    if status:
        items = [x for x in items if x["status"] == status]
    order = {"to_order": 0, "new": 1, "ordered": 2, "ignored": 3}
    items.sort(key=lambda x: (order[x["status"]], -x["requests"]))

    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Товар", "Статус", "Запросов", "Ушли без покупки", "Купили аналог", "Заказали под покупателя",
                "Аналог, который берут", "Где спрашивали", "Последний запрос", "Комментарий"])
    for x in items:
        analog = x["analogs"][0]["name"] if x["analogs"] else ""
        stores = ", ".join(f"{s['store_name']} — {s['requests']}" for s in x["stores"])
        w.writerow([x["title"], STATUS_LABELS[x["status"]], x["requests"], x["lost"], x["substituted"], x["ordered"],
                    analog, stores, (x["last_at"] or "")[:10], x["note"] or ""])
    name = f"spros-{date_from}-{date_to}.csv"
    return Response(content="﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
