import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions

router = APIRouter(prefix="/api/v1/dashboard/notifications", tags=["notifications"])


DEFAULT_SCORE_THRESHOLD = 40.0


async def get_score_threshold(db: AsyncSession, org_id: str, store_id) -> float:
    """Порог низкой оценки: уровня магазина, если задан, иначе организации, иначе дефолт."""
    row = (await db.execute(text("""
        SELECT score_threshold
        FROM admin_schema.alert_settings
        WHERE organization_id = :org_id
          AND (store_id = :store_id OR store_id IS NULL)
        ORDER BY (store_id = :store_id) DESC NULLS LAST
        LIMIT 1
    """), {"org_id": uuid.UUID(org_id), "store_id": store_id})).fetchone()
    return float(row.score_threshold) if row else DEFAULT_SCORE_THRESHOLD


@router.get("")
async def list_notifications(
    store_id: uuid.UUID | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    days: int = Query(default=14, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Сгруппированный по разговору список уведомлений:
      - есть нарушения комплаенса (хотя бы одно), ИЛИ
      - overall_score ниже порога из admin_schema.alert_settings (дефолт 40).
    Возвращается по одной записи на разговор.
    """
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id
    date_from = date.today() - timedelta(days=days)

    threshold = await get_score_threshold(db, org_id, effective_store_id)

    where = "c.organization_id = :org_id AND c.session_date >= :date_from"
    params: dict = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "threshold": threshold,
        "limit": limit,
    }
    if effective_store_id:
        where += " AND c.store_id = :store_id"
        params["store_id"] = effective_store_id

    # Условие на «уведомление» (выносим в отдельный SQL-фрагмент чтобы не дублировать).
    notif_cond = """
        EXISTS(
            SELECT 1 FROM analytics.conversation_compliance_violations v
            WHERE v.conversation_id = c.id
        )
        OR (c.overall_score IS NOT NULL AND c.overall_score < :threshold)
    """

    # Сначала тотал — сколько всего разговоров попало под условие.
    total_sql = text(f"""
        SELECT COUNT(*) AS total
        FROM analytics.conversations c
        WHERE {where} AND ({notif_cond})
    """)
    total = int((await db.execute(total_sql, params)).scalar_one() or 0)

    sql = text(f"""
        SELECT
            c.id AS conversation_id,
            c.session_date,
            c.analyzed_at,
            c.overall_score,
            c.outcome,
            c.topic,
            s.first_name AS seller_first_name,
            s.last_name AS seller_last_name,
            st.name AS store_name,
            (
                SELECT COUNT(*) FROM analytics.conversation_compliance_violations v
                WHERE v.conversation_id = c.id
            ) AS compliance_violations_count,
            (
                SELECT MAX(
                    CASE v.severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END
                ) FROM analytics.conversation_compliance_violations v
                WHERE v.conversation_id = c.id
            ) AS max_severity_rank,
            (c.overall_score IS NOT NULL AND c.overall_score < :threshold) AS below_threshold
        FROM analytics.conversations c
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {where} AND ({notif_cond})
        ORDER BY c.session_date DESC, c.analyzed_at DESC
        LIMIT :limit
    """)
    rows = (await db.execute(sql, params)).fetchall()

    items: list[dict] = []
    for r in rows:
        reasons: list[str] = []
        if r.compliance_violations_count and r.compliance_violations_count > 0:
            cnt = int(r.compliance_violations_count)
            word = "нарушение" if cnt == 1 else ("нарушения" if cnt < 5 else "нарушений")
            reasons.append(f"{cnt} {word} комплаенса")
        if r.below_threshold:
            score = int(r.overall_score) if r.overall_score is not None else 0
            reasons.append(f"низкий скор ({score}%, порог {int(threshold)}%)")

        sev_rank = int(r.max_severity_rank or 0)
        if sev_rank >= 3:
            severity = "high"
        elif sev_rank >= 2 or r.below_threshold:
            severity = "medium"
        else:
            severity = "low"

        items.append({
            "conversation_id": str(r.conversation_id),
            "session_date": str(r.session_date),
            "overall_score": float(r.overall_score) if r.overall_score is not None else None,
            "outcome": r.outcome,
            "topic": r.topic,
            "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            "store_name": r.store_name,
            "compliance_violations_count": int(r.compliance_violations_count or 0),
            "below_threshold": bool(r.below_threshold),
            "severity": severity,
            "reasons": reasons,
        })

    return {
        "items": items,
        "total": total,
        "score_threshold": threshold,
        "period_days": days,
    }
