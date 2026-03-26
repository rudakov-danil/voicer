import uuid
import csv
import io
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from minio import Minio
from minio.error import S3Error
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["export"])

EXPORT_BUCKET = "voiceiq-exports"


def _get_minio():
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


@router.get("/export")
async def export_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    conditions = ["organization_id = :org_id", "session_date BETWEEN :date_from AND :date_to"]
    params: dict = {"org_id": uuid.UUID(org_id), "date_from": date_from, "date_to": date_to}

    if effective_store_id:
        conditions.append("store_id = :store_id")
        params["store_id"] = effective_store_id
    if seller_id:
        conditions.append("seller_id = :seller_id")
        params["seller_id"] = seller_id

    where = " AND ".join(conditions)
    sql = text(f"""
        SELECT id, recording_id, seller_id, store_id, session_date,
               overall_score, outcome, topic, analyzed_at
        FROM analytics.conversations
        WHERE {where}
        ORDER BY session_date DESC
    """)
    rows = (await db.execute(sql, params)).fetchall()

    # Build CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "recording_id", "seller_id", "store_id", "session_date",
        "overall_score", "outcome", "topic", "analyzed_at",
    ])
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "id": row.id,
            "recording_id": row.recording_id,
            "seller_id": row.seller_id,
            "store_id": row.store_id,
            "session_date": row.session_date,
            "overall_score": row.overall_score,
            "outcome": row.outcome,
            "topic": row.topic,
            "analyzed_at": row.analyzed_at,
        })

    csv_bytes = output.getvalue().encode("utf-8-sig")
    export_id = str(uuid.uuid4())
    filename = f"voiceiq_export_{date_to}.csv"
    object_name = f"{org_id}/{export_id}.csv"

    minio_client = _get_minio()
    try:
        minio_client.make_bucket(EXPORT_BUCKET)
    except S3Error:
        pass

    minio_client.put_object(
        EXPORT_BUCKET,
        object_name,
        io.BytesIO(csv_bytes),
        length=len(csv_bytes),
        content_type="text/csv",
    )

    from datetime import timedelta as td
    url = minio_client.presigned_get_object(EXPORT_BUCKET, object_name, expires=td(hours=1))

    return {"url": url, "expires_in": 3600, "filename": filename}
