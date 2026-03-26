import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import httpx
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["conversations"])


@router.get("/conversations")
async def list_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    outcome: str | None = None,
    score_min: float | None = None,
    score_max: float | None = None,
    limit: int = Query(default=20),
    offset: int = Query(default=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    conditions = [
        "organization_id = :org_id",
        "session_date BETWEEN :date_from AND :date_to",
    ]
    params: dict = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "offset": offset,
    }

    if effective_store_id:
        conditions.append("store_id = :store_id")
        params["store_id"] = effective_store_id
    if seller_id:
        conditions.append("seller_id = :seller_id")
        params["seller_id"] = seller_id
    if outcome:
        conditions.append("outcome = :outcome")
        params["outcome"] = outcome
    if score_min is not None:
        conditions.append("overall_score >= :score_min")
        params["score_min"] = score_min
    if score_max is not None:
        conditions.append("overall_score <= :score_max")
        params["score_max"] = score_max

    where = " AND ".join(conditions)

    count_sql = text(f"SELECT COUNT(*) FROM analytics.conversations WHERE {where}")
    total = (await db.execute(count_sql, params)).scalar_one()

    list_sql = text(f"""
        SELECT
            c.id,
            c.recording_id,
            c.seller_id,
            c.store_id,
            c.session_date,
            c.overall_score,
            c.outcome,
            c.analyzed_at,
            EXISTS(
                SELECT 1 FROM analytics.conversation_script_results csr
                WHERE csr.conversation_id = c.id AND cardinality(csr.violations) > 0
            ) AS has_violations
        FROM analytics.conversations c
        WHERE {where}
        ORDER BY c.session_date DESC, c.analyzed_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = (await db.execute(list_sql, params)).fetchall()

    items = [
        {
            "id": r.id,
            "recording_id": r.recording_id,
            "seller_id": r.seller_id,
            "store_id": r.store_id,
            "session_date": str(r.session_date),
            "overall_score": float(r.overall_score) if r.overall_score is not None else None,
            "outcome": r.outcome,
            "has_violations": r.has_violations,
            "analyzed_at": r.analyzed_at,
        }
        for r in rows
    ]

    return {"items": items, "total": total}


@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, _ = org_store_conditions(user)

    # Get conversation from analytics
    sql = text("""
        SELECT id, recording_id, seller_id, store_id, session_date,
               overall_score, outcome, outcome_confidence, topic, sentiment_avg, analyzed_at
        FROM analytics.conversations
        WHERE id = :conv_id AND organization_id = :org_id
    """)
    row = (await db.execute(sql, {"conv_id": conversation_id, "org_id": uuid.UUID(org_id)})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    recording_id = str(row.recording_id)

    # Fetch transcript from transcription-service in parallel
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            transcript_resp = await client.get(
                f"{settings.TRANSCRIPTION_SERVICE_URL}/api/v1/transcription/transcripts/{recording_id}"
            )
            transcript_data = transcript_resp.json() if transcript_resp.status_code == 200 else {}
        except httpx.HTTPError:
            transcript_data = {}

    # Get script results
    scripts_sql = text("""
        SELECT csr.script_name, csr.script_score, csr.was_applied, csr.violations,
               cs.step_name, cs.score AS step_score, cs.step_detected, cs.evidence_text
        FROM analytics.conversation_script_results csr
        LEFT JOIN analytics.conversation_scores cs ON cs.conversation_id = csr.conversation_id
            AND cs.script_template_id = csr.script_template_id
        WHERE csr.conversation_id = :conv_id
    """)
    script_rows = (await db.execute(scripts_sql, {"conv_id": conversation_id})).fetchall()

    # Build script results
    scripts_map: dict = {}
    for sr in script_rows:
        key = sr.script_name
        if key not in scripts_map:
            scripts_map[key] = {
                "script_name": sr.script_name,
                "script_score": float(sr.script_score) if sr.script_score else None,
                "was_applied": sr.was_applied,
                "violations": sr.violations or [],
                "step_scores": [],
            }
        if sr.step_name:
            scripts_map[key]["step_scores"].append({
                "step_name": sr.step_name,
                "score": float(sr.step_score) if sr.step_score else 0,
                "detected": sr.step_detected,
                "evidence": sr.evidence_text,
            })

    conversation_data = {
        "id": row.id,
        "recording_id": row.recording_id,
        "seller_id": row.seller_id,
        "session_date": str(row.session_date),
        "overall_score": float(row.overall_score) if row.overall_score is not None else None,
        "outcome": row.outcome,
        "outcome_confidence": float(row.outcome_confidence) if row.outcome_confidence else None,
        "topic": row.topic,
        "sentiment_avg": float(row.sentiment_avg) if row.sentiment_avg else None,
        "script_results": list(scripts_map.values()),
    }

    return {
        "conversation": conversation_data,
        "transcript": transcript_data,
        "audio_url": transcript_data.get("audio_url"),
    }
