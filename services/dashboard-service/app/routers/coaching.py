"""План разбора с продавцом: разговоры, которые руководитель отложил для разбора,
и комментарии к ним (кнопка «Разобрать с продавцом» в карточке разговора).

Таблица analytics.coaching_items (миграция analytics-engine 0009). Пункт без
комментария — «разговор в плане разбора», с комментарием — заметка руководителя.
"""
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions

router = APIRouter(prefix="/api/v1/dashboard", tags=["coaching"])

_ITEM_COLS = """
    ci.id, ci.conversation_id, ci.seller_id, ci.comment, ci.moment_seconds, ci.status,
    ci.created_at, ci.resolved_at, ci.author_id,
    u.first_name AS author_first_name, u.last_name AS author_last_name, u.email AS author_email
"""


def _item(r) -> dict:
    author = f"{r.author_first_name or ''} {r.author_last_name or ''}".strip() or r.author_email
    return {
        "id": r.id,
        "conversation_id": r.conversation_id,
        "seller_id": r.seller_id,
        "comment": r.comment,
        "moment_seconds": r.moment_seconds,
        "status": r.status,
        "created_at": r.created_at,
        "resolved_at": r.resolved_at,
        "author_id": r.author_id,
        "author_name": author,
    }


async def _conversation_or_404(db: AsyncSession, conversation_id: uuid.UUID, user: dict):
    org_id, forced_store_id = org_store_conditions(user)
    sql = "SELECT id, seller_id FROM analytics.conversations WHERE id = :id AND organization_id = :org_id"
    params: dict = {"id": conversation_id, "org_id": uuid.UUID(org_id)}
    if forced_store_id:
        sql += " AND store_id = :store_id"
        params["store_id"] = forced_store_id
    row = (await db.execute(text(sql), params)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return row


class CoachingCreate(BaseModel):
    comment: str | None = Field(default=None, max_length=4000)
    moment_seconds: int | None = Field(default=None, ge=0)


class CoachingUpdate(BaseModel):
    status: Literal["open", "done"]


@router.get("/conversations/{conversation_id}/coaching")
async def list_conversation_coaching(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _conversation_or_404(db, conversation_id, user)
    rows = (await db.execute(text(f"""
        SELECT {_ITEM_COLS}
        FROM analytics.coaching_items ci
        LEFT JOIN auth.users u ON u.id = ci.author_id
        WHERE ci.conversation_id = :conv_id
        ORDER BY ci.created_at
    """), {"conv_id": conversation_id})).fetchall()
    return {"items": [_item(r) for r in rows]}


@router.post("/conversations/{conversation_id}/coaching", status_code=201)
async def add_conversation_coaching(
    conversation_id: uuid.UUID,
    body: CoachingCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _conversation_or_404(db, conversation_id, user)
    comment = (body.comment or "").strip() or None
    if comment is None:
        # Без комментария это отметка «в плане разбора» — вторую такую же не заводим
        existing = (await db.execute(text("""
            SELECT id FROM analytics.coaching_items
            WHERE conversation_id = :conv_id AND comment IS NULL AND status = 'open'
            LIMIT 1
        """), {"conv_id": conversation_id})).fetchone()
        if existing:
            row = (await db.execute(text(f"""
                SELECT {_ITEM_COLS} FROM analytics.coaching_items ci
                LEFT JOIN auth.users u ON u.id = ci.author_id WHERE ci.id = :id
            """), {"id": existing.id})).fetchone()
            return _item(row)

    new_id = (await db.execute(text("""
        INSERT INTO analytics.coaching_items
            (organization_id, conversation_id, seller_id, author_id, comment, moment_seconds)
        VALUES (:org_id, :conv_id, :seller_id, :author_id, :comment, :moment)
        RETURNING id
    """), {
        "org_id": uuid.UUID(user["organization_id"]),
        "conv_id": conversation_id,
        "seller_id": conv.seller_id,
        "author_id": uuid.UUID(user["sub"]),
        "comment": comment,
        "moment": body.moment_seconds,
    })).scalar_one()
    await db.commit()
    row = (await db.execute(text(f"""
        SELECT {_ITEM_COLS} FROM analytics.coaching_items ci
        LEFT JOIN auth.users u ON u.id = ci.author_id WHERE ci.id = :id
    """), {"id": new_id})).fetchone()
    return _item(row)


async def _item_or_404(db: AsyncSession, item_id: uuid.UUID, user: dict):
    org_id, forced_store_id = org_store_conditions(user)
    sql = """
        SELECT ci.id, ci.author_id FROM analytics.coaching_items ci
        JOIN analytics.conversations c ON c.id = ci.conversation_id
        WHERE ci.id = :id AND ci.organization_id = :org_id
    """
    params: dict = {"id": item_id, "org_id": uuid.UUID(org_id)}
    if forced_store_id:
        sql += " AND c.store_id = :store_id"
        params["store_id"] = forced_store_id
    row = (await db.execute(text(sql), params)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Coaching item not found")
    return row


@router.patch("/coaching/{item_id}")
async def update_coaching(
    item_id: uuid.UUID,
    body: CoachingUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _item_or_404(db, item_id, user)
    await db.execute(text("""
        UPDATE analytics.coaching_items
        SET status = :status, resolved_at = CASE WHEN :done THEN now() ELSE NULL END
        WHERE id = :id
    """), {"id": item_id, "status": body.status, "done": body.status == "done"})
    await db.commit()
    row = (await db.execute(text(f"""
        SELECT {_ITEM_COLS} FROM analytics.coaching_items ci
        LEFT JOIN auth.users u ON u.id = ci.author_id WHERE ci.id = :id
    """), {"id": item_id})).fetchone()
    return _item(row)


@router.delete("/coaching/{item_id}", status_code=204)
async def delete_coaching(
    item_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await _item_or_404(db, item_id, user)
    # Удалить чужой комментарий может только директор или администратор
    if str(item.author_id) != user["sub"] and user["role"] not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Only the author can delete this item")
    await db.execute(text("DELETE FROM analytics.coaching_items WHERE id = :id"), {"id": item_id})
    await db.commit()


@router.get("/coaching")
async def list_coaching(
    seller_id: uuid.UUID | None = None,
    status: Literal["open", "done"] | None = "open",
    limit: int = Query(default=50, le=200),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """План разбора по организации или по одному продавцу — с данными разговора."""
    org_id, forced_store_id = org_store_conditions(user)
    conditions = ["ci.organization_id = :org_id"]
    params: dict = {"org_id": uuid.UUID(org_id), "limit": limit}
    if forced_store_id:
        conditions.append("c.store_id = :store_id")
        params["store_id"] = forced_store_id
    if seller_id:
        conditions.append("ci.seller_id = :seller_id")
        params["seller_id"] = seller_id
    if status:
        conditions.append("ci.status = :status")
        params["status"] = status
    rows = (await db.execute(text(f"""
        SELECT {_ITEM_COLS},
               c.topic, c.outcome, c.overall_score, c.session_date,
               s.first_name AS seller_first_name, s.last_name AS seller_last_name
        FROM analytics.coaching_items ci
        JOIN analytics.conversations c ON c.id = ci.conversation_id
        LEFT JOIN auth.users u ON u.id = ci.author_id
        LEFT JOIN admin_schema.sellers s ON s.id = ci.seller_id
        WHERE {" AND ".join(conditions)}
        ORDER BY ci.created_at DESC
        LIMIT :limit
    """), params)).fetchall()
    return {
        "items": [
            {
                **_item(r),
                "topic": r.topic,
                "outcome": r.outcome,
                "overall_score": float(r.overall_score) if r.overall_score is not None else None,
                "session_date": str(r.session_date),
                "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            }
            for r in rows
        ]
    }
