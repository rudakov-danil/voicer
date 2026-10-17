"""Authenticated, idempotent mobile uploads and a durable processing queue.

The queue lives in recordings, so accepted uploads survive API restarts. A
PostgreSQL session lock prevents two API workers from processing the same file.
"""
import asyncio
import hashlib
import logging
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import get_db, async_session_maker
from app.dependencies import get_mobile_user
from app.minio_client import upload_bytes, download_bytes
from app.routers.upload import BUCKET, _ensure_bucket, _transcribe_and_enqueue

router = APIRouter(prefix="/api/v1/recorder/mobile", tags=["mobile"])
logger = logging.getLogger(__name__)
MAX_BYTES = 100 * 1024 * 1024
MIME_TYPES = {".webm": "audio/webm", ".mp4": "audio/mp4", ".m4a": "audio/mp4", ".ogg": "audio/ogg"}


class RecordingStatuses(BaseModel):
    recording_ids: list[UUID] = Field(min_length=1, max_length=50)


@router.post("/statuses")
async def recording_statuses(body: RecordingStatuses, current_user: dict = Depends(get_mobile_user),
                             db: AsyncSession = Depends(get_db)):
    conditions = ["organization_id=:org", "id=ANY(:ids)", "source='mobile'"]
    params = {"org": UUID(current_user["organization_id"]), "ids": body.recording_ids}
    role = current_user.get("role")
    if role in ("employee", "manager"):
        conditions.append("store_id=:store")
        params["store"] = UUID(current_user["store_id"])
        if role == "employee":
            conditions.append("seller_id=:seller")
            params["seller"] = UUID(current_user["seller_id"])
    elif role == "rop":
        conditions.append("store_id=ANY(:stores)")
        params["stores"] = [UUID(s) for s in current_user.get("rop_stores", [])]
    elif role not in ("director", "admin"):
        raise HTTPException(403, "Нет доступа к записям")
    rows = (await db.execute(text(f"SELECT id,status FROM recorder.recordings WHERE {' AND '.join(conditions)}"), params)).mappings().all()
    return {"items": [{"recording_id": str(r["id"]), "status": r["status"]} for r in rows]}


def check_store_access(user: dict, store_id: UUID):
    role = user.get("role")
    allowed = role in ("director", "admin")
    if role in ("manager", "employee"):
        allowed = str(store_id) == str(user.get("store_id"))
    if role == "rop":
        allowed = str(store_id) in [str(s) for s in user.get("rop_stores", [])]
    if not allowed:
        raise HTTPException(403, "Нет доступа к этому магазину")


@router.post("/upload", status_code=202)
async def upload_mobile(
    file: UploadFile = File(...),
    seller_id: UUID = Form(...),
    store_id: UUID = Form(...),
    session_date: date = Form(...),
    client_upload_id: UUID = Form(...),
    started_at: datetime = Form(...),
    current_user: dict = Depends(get_mobile_user),
    db: AsyncSession = Depends(get_db),
):
    check_store_access(current_user, store_id)
    if current_user.get("role") == "employee" and str(seller_id) != current_user.get("seller_id"):
        raise HTTPException(403, "Можно записывать только свои разговоры")
    if started_at.tzinfo is None:
        raise HTTPException(422, "started_at должен содержать часовой пояс")
    if started_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(422, "Проверьте дату и время на телефоне")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in MIME_TYPES:
        raise HTTPException(415, "Поддерживаются WebM, MP4, M4A и OGG")
    org_id = UUID(current_user["organization_id"])
    seller = (await db.execute(text("""
        SELECT s.id FROM admin_schema.sellers s
        JOIN admin_schema.stores st ON st.id = s.store_id
        WHERE s.id = :seller AND s.store_id = :store AND s.organization_id = :org
          AND st.organization_id = :org AND s.is_active AND st.is_active
    """), {"seller": seller_id, "store": store_id, "org": org_id})).first()
    if not seller:
        raise HTTPException(403, "Сотрудник или магазин недоступен")

    # Bound memory even if a client omits or lies about Content-Length.
    audio = await file.read(MAX_BYTES + 1)
    if not audio:
        raise HTTPException(400, "Запись пуста")
    if len(audio) > MAX_BYTES:
        raise HTTPException(413, "Максимальный размер записи — 100 МБ")
    digest = hashlib.sha256(audio).hexdigest()
    recording_id = uuid5(org_id, f"mobile:{current_user['sub']}:{client_upload_id}")
    lock_key = int.from_bytes(recording_id.bytes[:8], "big", signed=True)
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    existing = (await db.execute(text("""
        SELECT status, seller_id, store_id, call_metadata FROM recorder.recordings WHERE id = :id
    """), {"id": recording_id})).mappings().first()
    if existing:
        if (str(existing["seller_id"]) != str(seller_id)
                or str(existing["store_id"]) != str(store_id)
                or (existing["call_metadata"] or {}).get("sha256") != digest):
            raise HTTPException(409, "Этот идентификатор уже использован для другой записи")
        await db.commit()
        return {"recording_id": str(recording_id), "status": existing["status"], "duplicate": True}

    object_path = f"{org_id}/{store_id}/{seller_id}/{session_date}/{recording_id}{ext}"
    await run_in_threadpool(_ensure_bucket)
    await run_in_threadpool(upload_bytes, BUCKET, object_path, audio, MIME_TYPES[ext])
    await db.execute(text("""
        INSERT INTO recorder.recordings
          (id, organization_id, store_id, seller_id, device_id, session_date,
           started_at, audio_path, file_size_bytes, status, source, call_metadata, created_at, updated_at)
        VALUES (:id, :org, :store, :seller, :device, :day, :started, :path, :size,
                'mobile_queued', 'mobile', jsonb_build_object('sha256', CAST(:digest AS text)), :now, :now)
    """), {"id": recording_id, "org": org_id, "store": store_id, "seller": seller_id,
           "device": UUID(int=0), "day": session_date, "started": started_at,
           "path": f"{BUCKET}/{object_path}", "size": len(audio), "digest": digest,
           "now": datetime.now(timezone.utc)})
    await db.commit()
    return {"recording_id": str(recording_id), "status": "mobile_queued", "duplicate": False}


async def process_mobile_queue():
    while True:
        try:
            async with async_session_maker() as db:
                rows = (await db.execute(text("""
                    SELECT id FROM recorder.recordings
                    WHERE source = 'mobile' AND status IN ('mobile_queued', 'mobile_processing')
                    ORDER BY created_at LIMIT 20
                """))).scalars().all()
            for recording_id in rows:
                await process_mobile_recording(recording_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Mobile queue iteration failed; retrying")
        await asyncio.sleep(5)


async def process_mobile_recording(recording_id):
    # Use a dedicated connection: session advisory locks must not leak into the pool.
    from app.database import engine
    key = int.from_bytes(recording_id.bytes[:8], "big", signed=True)
    async with engine.connect() as conn:
        locked = (await conn.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": key})).scalar()
        await conn.commit()
        if not locked:
            return
        try:
            row = (await conn.execute(text("""
                SELECT * FROM recorder.recordings WHERE id = :id
                AND status IN ('mobile_queued', 'mobile_processing')
            """), {"id": recording_id})).mappings().first()
            if not row:
                return
            await conn.execute(text("""
                UPDATE recorder.recordings SET status = 'mobile_processing', updated_at = now() WHERE id = :id
            """), {"id": recording_id})
            await conn.commit()
            bucket, path = row["audio_path"].split("/", 1)
            audio = await run_in_threadpool(download_bytes, bucket, path)
            await _transcribe_and_enqueue(
                recording_id=recording_id, audio_bytes=audio, ext=Path(path).suffix,
                org_id=str(row["organization_id"]), store_id=str(row["store_id"]),
                seller_id=str(row["seller_id"]), session_date=str(row["session_date"]),
                audio_path=row["audio_path"],
            )
        finally:
            await conn.rollback()
            await conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
            await conn.commit()
