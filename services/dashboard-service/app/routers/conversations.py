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
        "c.organization_id = :org_id",
        "c.session_date BETWEEN :date_from AND :date_to",
    ]
    params: dict = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "offset": offset,
    }

    if effective_store_id:
        conditions.append("c.store_id = :store_id")
        params["store_id"] = effective_store_id
    if seller_id:
        conditions.append("c.seller_id = :seller_id")
        params["seller_id"] = seller_id
    if outcome:
        conditions.append("c.outcome = :outcome")
        params["outcome"] = outcome
    if score_min is not None:
        conditions.append("c.overall_score >= :score_min")
        params["score_min"] = score_min
    if score_max is not None:
        conditions.append("c.overall_score <= :score_max")
        params["score_max"] = score_max

    where = " AND ".join(conditions)

    count_sql = text(f"SELECT COUNT(*) FROM analytics.conversations c WHERE {where}")
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
            c.topic,
            c.analyzed_at,
            c.has_upsell,
            r.duration_seconds,
            s.first_name AS seller_first_name,
            s.last_name AS seller_last_name,
            st.name AS store_name,
            EXISTS(
                SELECT 1 FROM analytics.conversation_script_results csr
                WHERE csr.conversation_id = c.id AND cardinality(csr.violations) > 0
            ) AS has_violations
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
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
            "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            "store_name": r.store_name,
            "session_date": str(r.session_date),
            "overall_score": float(r.overall_score) if r.overall_score is not None else None,
            "outcome": r.outcome,
            "topic": r.topic,
            "duration_seconds": r.duration_seconds,
            "has_violations": r.has_violations,
            "has_upsell": r.has_upsell,
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

    # Get conversation from analytics with seller/store names
    sql = text("""
        SELECT c.id, c.recording_id, c.seller_id, c.store_id, c.session_date,
               c.overall_score, c.outcome, c.outcome_confidence, c.topic, c.sentiment_avg, c.analyzed_at,
               c.has_upsell, c.upsell_results,
               c.has_crosssell, c.crosssell_results,
               r.duration_seconds,
               s.first_name AS seller_first_name, s.last_name AS seller_last_name,
               st.name AS store_name
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE c.id = :conv_id AND c.organization_id = :org_id
    """)
    row = (await db.execute(sql, {"conv_id": conversation_id, "org_id": uuid.UUID(org_id)})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    recording_id = str(row.recording_id)

    # Fetch transcript directly from DB (same postgres, no auth needed)
    transcript_sql = text("""
        SELECT id, full_text, language, duration_seconds, status
        FROM transcription.transcripts
        WHERE recording_id = :rec_id
        LIMIT 1
    """)
    t_row = (await db.execute(transcript_sql, {"rec_id": row.recording_id})).fetchone()

    segments = []
    transcript_data = {}
    if t_row:
        seg_sql = text("""
            SELECT id, speaker_role, text, start_ms, end_ms, segment_index
            FROM transcription.transcript_segments
            WHERE transcript_id = :t_id
            ORDER BY segment_index
        """)
        seg_rows = (await db.execute(seg_sql, {"t_id": t_row.id})).fetchall()
        segments = [
            {
                "speaker_role": s.speaker_role,
                "text": s.text,
                "start_ms": s.start_ms,
                "end_ms": s.end_ms,
            }
            for s in seg_rows
        ]
        transcript_data = {
            "id": str(t_row.id),
            "full_text": t_row.full_text,
            "duration_seconds": t_row.duration_seconds or (row.duration_seconds if hasattr(row, 'duration_seconds') else None),
            "status": t_row.status,
            "segments": segments,
        }

    # Get script results — JOIN scripts.script_templates чтобы достать short_name.
    scripts_sql = text("""
        SELECT csr.script_name, csr.script_score, csr.was_applied, csr.violations,
               cs.step_name, cs.score AS step_score, cs.step_detected, cs.evidence_text,
               st.short_name AS script_short_name
        FROM analytics.conversation_script_results csr
        LEFT JOIN analytics.conversation_scores cs ON cs.conversation_id = csr.conversation_id
            AND cs.script_template_id = csr.script_template_id
        LEFT JOIN scripts.script_templates st ON st.id = csr.script_template_id
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
                "script_short_name": sr.script_short_name,
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

    # Objections — нужны для подсветки красным маркером в транскрипте.
    objections_sql = text("""
        SELECT type, is_resolved, resolution_technique, raw_text, sort_order
        FROM analytics.objections
        WHERE conversation_id = :conv_id
        ORDER BY sort_order
    """)
    objection_rows = (await db.execute(objections_sql, {"conv_id": conversation_id})).fetchall()
    objections_data = [
        {
            "type": o.type,
            "is_resolved": o.is_resolved,
            "resolution_technique": o.resolution_technique,
            "raw_text": o.raw_text,
            "sort_order": o.sort_order,
        }
        for o in objection_rows
    ]

    seller_name = f"{row.seller_first_name or ''} {row.seller_last_name or ''}".strip() or None
    duration = transcript_data.get("duration_seconds") or (row.duration_seconds if hasattr(row, 'duration_seconds') else None)

    conversation_data = {
        "id": row.id,
        "recording_id": row.recording_id,
        "seller_id": row.seller_id,
        "store_id": row.store_id,
        "seller_name": seller_name,
        "store_name": row.store_name,
        "session_date": str(row.session_date),
        "analyzed_at": str(row.analyzed_at) if row.analyzed_at else None,
        "duration_seconds": duration,
        "overall_score": float(row.overall_score) if row.overall_score is not None else None,
        "outcome": row.outcome,
        "outcome_confidence": float(row.outcome_confidence) if row.outcome_confidence else None,
        "topic": row.topic,
        "sentiment_avg": float(row.sentiment_avg) if row.sentiment_avg else None,
        "has_upsell": row.has_upsell,
        "upsell_results": row.upsell_results,
        "has_crosssell": row.has_crosssell,
        "crosssell_results": row.crosssell_results,
        "script_results": list(scripts_map.values()),
        "objections": objections_data,
    }

    return {
        "conversation": conversation_data,
        "transcript": transcript_data,
    }
