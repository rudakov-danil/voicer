import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app import redis_client as rc
from app.config import settings
from app.routers.home import SELL_NEED, SELL_DONE

router = APIRouter(prefix="/api/v1/dashboard", tags=["overview"])


@router.get("/overview")
async def get_overview(
    store_id: uuid.UUID | None = None,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    date_range = f"{date_from}_{date_to}"
    store_key = str(effective_store_id) if effective_store_id else "all"
    cache_key = f"dashboard:overview:{org_id}:{store_key}:{date_range}"

    cached = await rc.get_cached(cache_key)
    if cached is not None:
        return cached

    store_filter = "AND store_id = :store_id" if effective_store_id else ""
    params = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
    }
    if effective_store_id:
        params["store_id"] = effective_store_id

    # Main aggregation
    agg_sql = text(f"""
        SELECT
            COUNT(*) AS total,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate,
            SUM(CASE WHEN overall_score >= 80 THEN 1 ELSE 0 END) AS excellent,
            SUM(CASE WHEN overall_score >= 60 AND overall_score < 80 THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN overall_score < 60 THEN 1 ELSE 0 END) AS poor,
            SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END) AS purchases,
            COUNT(*) FILTER (WHERE {SELL_NEED}) AS sell_need,
            COUNT(*) FILTER (WHERE {SELL_NEED} AND {SELL_DONE}) AS sell_done
        FROM analytics.conversations c
        WHERE organization_id = :org_id
          AND session_date BETWEEN :date_from AND :date_to
          {store_filter}
    """)
    agg_result = (await db.execute(agg_sql, params)).fetchone()

    objections_sql = text(f"""
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE o.is_resolved) AS resolved
        FROM analytics.objections o
        JOIN analytics.conversations c ON c.id = o.conversation_id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter.replace("store_id", "c.store_id")}
    """)
    obj_result = (await db.execute(objections_sql, params)).fetchone()

    # Outcomes distribution
    outcomes_sql = text(f"""
        SELECT outcome, COUNT(*) AS cnt
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY outcome
        ORDER BY cnt DESC
    """)
    outcome_rows = (await db.execute(outcomes_sql, params)).fetchall()

    # Daily stats
    daily_sql = text(f"""
        SELECT
            session_date,
            COUNT(*) AS total,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY session_date
        ORDER BY session_date
    """)
    daily_rows = (await db.execute(daily_sql, params)).fetchall()

    result = {
        "period": {"from": str(date_from), "to": str(date_to)},
        "total_conversations": agg_result.total if agg_result else 0,
        "avg_score": round(float(agg_result.avg_score), 1) if agg_result else 0,
        "conversion_rate": round(float(agg_result.conversion_rate), 4) if agg_result else 0,
        "purchases": int(agg_result.purchases or 0) if agg_result else 0,
        # Допродажа: разговоры, где сработало правило, и где продавец предложил хоть что-то
        "sell_need": int(agg_result.sell_need or 0) if agg_result else 0,
        "sell_done": int(agg_result.sell_done or 0) if agg_result else 0,
        "objections_total": int(obj_result.total or 0) if obj_result else 0,
        "objections_resolved": int(obj_result.resolved or 0) if obj_result else 0,
        "score_distribution": {
            "excellent": int(agg_result.excellent or 0),
            "good": int(agg_result.good or 0),
            "poor": int(agg_result.poor or 0),
        },
        "daily_stats": [
            {
                "date": str(row.session_date),
                "total": row.total,
                "avg_score": round(float(row.avg_score), 1),
                "conversion_rate": round(float(row.conversion_rate), 4),
            }
            for row in daily_rows
        ],
        "outcomes": [
            {"outcome": row.outcome or "unknown", "count": row.cnt}
            for row in outcome_rows
        ],
    }

    await rc.set_cached(cache_key, result, ttl_seconds=settings.CACHE_TTL_SECONDS)
    return result
