import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Conversation, ConversationScriptResult, ConversationScore, Objection
from app.config import settings
import httpx

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


def _org_filter(user: dict):
    org_id = uuid.UUID(user["organization_id"])
    role = user["role"]
    conditions = [Conversation.organization_id == org_id]
    if role == "manager":
        if user.get("store_id"):
            conditions.append(Conversation.store_id == uuid.UUID(user["store_id"]))
    return conditions


@router.get("/conversations")
async def list_conversations(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    outcome: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = _org_filter(user)
    if store_id:
        conditions.append(Conversation.store_id == store_id)
    if seller_id:
        conditions.append(Conversation.seller_id == seller_id)
    if date_from:
        conditions.append(Conversation.session_date >= date_from)
    if date_to:
        conditions.append(Conversation.session_date <= date_to)
    if outcome:
        conditions.append(Conversation.outcome == outcome)

    q = select(Conversation).where(and_(*conditions))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    q = q.options(selectinload(Conversation.script_results))
    conversations = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    items = []
    for c in conversations:
        items.append({
            "id": c.id,
            "recording_id": c.recording_id,
            "seller_id": c.seller_id,
            "store_id": c.store_id,
            "session_date": c.session_date,
            "overall_score": float(c.overall_score) if c.overall_score is not None else None,
            "outcome": c.outcome,
            "scripts_count": len(c.script_results),
            "analyzed_at": c.analyzed_at,
        })

    return {"items": items, "total": total}


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.script_results),
            selectinload(Conversation.scores),
            selectinload(Conversation.objections),
        )
        .where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None or str(conv.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build script_results with step scores
    script_results = []
    for sr in conv.script_results:
        step_scores = [
            s for s in conv.scores
            if s.script_template_id == sr.script_template_id
        ]
        script_results.append({
            "script_template_id": sr.script_template_id,
            "script_name": sr.script_name,
            "was_applied": sr.was_applied,
            "script_score": float(sr.script_score) if sr.script_score is not None else None,
            "violations": sr.violations or [],
            "skip_reason": sr.skip_reason,
            "step_scores": [
                {
                    "step_name": s.step_name,
                    "weight": float(s.step_weight),
                    "score": float(s.score),
                    "detected": s.step_detected,
                    "evidence": s.evidence_text,
                }
                for s in sorted(step_scores, key=lambda x: x.step_name)
            ],
        })

    return {
        "id": conv.id,
        "recording_id": conv.recording_id,
        "overall_score": float(conv.overall_score) if conv.overall_score is not None else None,
        "outcome": conv.outcome,
        "outcome_confidence": float(conv.outcome_confidence) if conv.outcome_confidence is not None else None,
        "topic": conv.topic,
        "sentiment_avg": float(conv.sentiment_avg) if conv.sentiment_avg is not None else None,
        "script_results": script_results,
        "objections": [
            {
                "type": o.type,
                "is_resolved": o.is_resolved,
                "resolution_technique": o.resolution_technique,
                "raw_text": o.raw_text,
            }
            for o in sorted(conv.objections, key=lambda x: x.sort_order)
        ],
    }


@router.get("/sellers/{seller_id}/stats")
async def get_seller_stats(
    seller_id: uuid.UUID,
    date_from: date,
    date_to: date,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = uuid.UUID(user["organization_id"])
    conditions = [
        Conversation.organization_id == org_id,
        Conversation.seller_id == seller_id,
        Conversation.session_date >= date_from,
        Conversation.session_date <= date_to,
    ]

    q = select(Conversation).options(
        selectinload(Conversation.script_results),
        selectinload(Conversation.scores),
    ).where(and_(*conditions))
    conversations = (await db.execute(q)).scalars().all()

    if not conversations:
        return {
            "seller_id": seller_id,
            "period": {"from": date_from, "to": date_to},
            "total_conversations": 0,
            "avg_overall_score": None,
            "conversion_rate": 0.0,
            "score_trend": [],
            "script_breakdown": [],
        }

    total = len(conversations)
    scores = [float(c.overall_score) for c in conversations if c.overall_score is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else None
    purchases = sum(1 for c in conversations if c.outcome == "purchase")
    conversion_rate = round(purchases / total, 4) if total else 0.0

    # Score trend by date
    trend_map: dict = {}
    for c in conversations:
        d = str(c.session_date)
        if c.overall_score is not None:
            trend_map.setdefault(d, []).append(float(c.overall_score))
    score_trend = [
        {"date": d, "avg_score": round(sum(v) / len(v), 2)}
        for d, v in sorted(trend_map.items())
    ]

    # Script breakdown
    script_map: dict = {}
    for c in conversations:
        for sr in c.script_results:
            if not sr.was_applied or sr.script_score is None:
                continue
            key = str(sr.script_template_id)
            script_map.setdefault(key, {"name": sr.script_name, "scores": [], "steps": {}})
            script_map[key]["scores"].append(float(sr.script_score))
            for s in c.scores:
                if s.script_template_id == sr.script_template_id:
                    sname = s.step_name
                    script_map[key]["steps"].setdefault(sname, []).append(float(s.score))

    script_breakdown = []
    for info in script_map.values():
        step_averages = [
            {"step_name": sname, "avg_score": round(sum(svs) / len(svs), 2)}
            for sname, svs in info["steps"].items()
        ]
        script_breakdown.append({
            "script_name": info["name"],
            "avg_score": round(sum(info["scores"]) / len(info["scores"]), 2),
            "step_averages": step_averages,
        })

    return {
        "seller_id": seller_id,
        "period": {"from": date_from, "to": date_to},
        "total_conversations": total,
        "avg_overall_score": avg_score,
        "conversion_rate": conversion_rate,
        "score_trend": score_trend,
        "script_breakdown": script_breakdown,
    }


@router.post("/reanalyze/{recording_id}", status_code=202)
async def reanalyze(
    recording_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Find conversation
    result = await db.execute(
        select(Conversation).where(Conversation.recording_id == recording_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None or str(conv.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete old detail records (cascade handles scores/objections)
    await db.execute(
        delete(ConversationScriptResult).where(ConversationScriptResult.conversation_id == conv.id)
    )
    await db.commit()

    # Publish reanalyze task
    from app.rabbitmq import publish
    await publish("queue.analyze", {
        "recording_id": str(conv.recording_id),
        "transcript_id": str(conv.transcript_id),
        "seller_id": str(conv.seller_id),
        "store_id": str(conv.store_id),
        "organization_id": str(conv.organization_id),
    })

    return {"status": "queued", "recording_id": recording_id}
