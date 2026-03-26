import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/dashboard/alerts", tags=["alerts"])


class AlertSettingsUpdate(BaseModel):
    score_threshold: Optional[float] = None
    email_recipients: Optional[List[str]] = None
    is_active: Optional[bool] = None
    no_activity_hours: Optional[int] = None


@router.get("")
async def get_alert_settings(
    store_id: uuid.UUID | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = user["organization_id"]
    if store_id:
        sql = text("""
            SELECT id, store_id, score_threshold, email_recipients, is_active, no_activity_hours
            FROM admin_schema.alert_settings
            WHERE organization_id = :org_id AND store_id = :store_id
        """)
        row = (await db.execute(sql, {"org_id": uuid.UUID(org_id), "store_id": store_id})).fetchone()
    else:
        sql = text("""
            SELECT id, store_id, score_threshold, email_recipients, is_active, no_activity_hours
            FROM admin_schema.alert_settings
            WHERE organization_id = :org_id AND store_id IS NULL
        """)
        row = (await db.execute(sql, {"org_id": uuid.UUID(org_id)})).fetchone()

    if not row:
        return {"score_threshold": 60.0, "email_recipients": [], "is_active": False, "no_activity_hours": 24}

    return {
        "id": row.id,
        "store_id": row.store_id,
        "score_threshold": float(row.score_threshold),
        "email_recipients": row.email_recipients or [],
        "is_active": row.is_active,
        "no_activity_hours": row.no_activity_hours,
    }
