import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app import redis_client as rc
from app.config import settings

router = APIRouter(prefix="/api/v1/dashboard", tags=["sellers"])


@router.get("/sellers")
async def list_sellers(
    store_id: uuid.UUID | None = None,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    sort_by: str = Query(default="avg_score"),
    limit: int = Query(default=50),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    # Previous period for trend
    period_days = (date_to - date_from).days or 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_days)

    store_filter = "AND store_id = :store_id" if effective_store_id else ""
    params = {
        "org_id": uuid.UUID(org_id),
        "date_from": date_from,
        "date_to": date_to,
        "prev_from": prev_from,
        "prev_to": prev_to,
    }
    if effective_store_id:
        params["store_id"] = effective_store_id

    valid_sorts = {"avg_score": "avg_score DESC", "total": "total_conversations DESC", "conversion_rate": "conversion_rate DESC"}
    order_clause = valid_sorts.get(sort_by, "avg_score DESC")

    sql = text(f"""
        WITH current_period AS (
            SELECT
                seller_id,
                COUNT(*) AS total_conversations,
                COALESCE(AVG(overall_score), 0) AS avg_score,
                CASE WHEN COUNT(*) > 0
                     THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                     ELSE 0 END AS conversion_rate
            FROM analytics.conversations
            WHERE organization_id = :org_id
              AND session_date BETWEEN :date_from AND :date_to
              {store_filter}
            GROUP BY seller_id
        ),
        prev_period AS (
            SELECT
                seller_id,
                COALESCE(AVG(overall_score), 0) AS prev_avg_score
            FROM analytics.conversations
            WHERE organization_id = :org_id
              AND session_date BETWEEN :prev_from AND :prev_to
              {store_filter}
            GROUP BY seller_id
        )
        SELECT
            c.seller_id,
            c.total_conversations,
            c.avg_score,
            c.conversion_rate,
            COALESCE(p.prev_avg_score, 0) AS prev_avg_score
        FROM current_period c
        LEFT JOIN prev_period p ON c.seller_id = p.seller_id
        ORDER BY {order_clause}
        LIMIT :limit
    """)
    params["limit"] = limit
    rows = (await db.execute(sql, params)).fetchall()

    # Weakest step per seller
    weakest_sql = text(f"""
        SELECT
            c.seller_id,
            cs.step_name,
            AVG(cs.score) AS avg_step_score
        FROM analytics.conversations c
        JOIN analytics.conversation_scores cs ON cs.conversation_id = c.id
        WHERE c.organization_id = :org_id
          AND c.session_date BETWEEN :date_from AND :date_to
          {store_filter}
        GROUP BY c.seller_id, cs.step_name
    """)
    weakest_rows = (await db.execute(weakest_sql, params)).fetchall()

    # Build weakest step map
    seller_steps: dict[str, dict] = {}
    for wr in weakest_rows:
        sid = str(wr.seller_id)
        if sid not in seller_steps or wr.avg_step_score < seller_steps[sid]["score"]:
            seller_steps[sid] = {"name": wr.step_name, "score": float(wr.avg_step_score)}

    items = []
    for row in rows:
        sid = str(row.seller_id)
        curr = float(row.avg_score)
        prev = float(row.prev_avg_score)
        if curr > prev + 2:
            trend = "up"
        elif curr < prev - 2:
            trend = "down"
        else:
            trend = "stable"

        items.append({
            "seller_id": row.seller_id,
            "total_conversations": row.total_conversations,
            "avg_score": round(curr, 1),
            "conversion_rate": round(float(row.conversion_rate), 4),
            "score_trend": trend,
            "weakest_step": seller_steps.get(sid, {}).get("name"),
        })

    return {"items": items, "total": len(items)}


@router.get("/sellers/{seller_id}/detail")
async def seller_detail(
    seller_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, _ = org_store_conditions(user)

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    params = {
        "org_id": uuid.UUID(org_id),
        "seller_id": seller_id,
        "date_from": date_from,
        "date_to": date_to,
    }

    stats_sql = text("""
        SELECT
            COUNT(*) AS total_conversations,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
    """)
    stats = (await db.execute(stats_sql, params)).fetchone()

    stage_sql = text("""
        SELECT cs.step_name, AVG(cs.score) AS avg_score
        FROM analytics.conversations c
        JOIN analytics.conversation_scores cs ON cs.conversation_id = c.id
        WHERE c.organization_id = :org_id
          AND c.seller_id = :seller_id
          AND c.session_date BETWEEN :date_from AND :date_to
        GROUP BY cs.step_name
        ORDER BY avg_score
    """)
    stage_rows = (await db.execute(stage_sql, params)).fetchall()

    recent_sql = text("""
        SELECT id, session_date, overall_score, outcome
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
        ORDER BY session_date DESC
        LIMIT 10
    """)
    recent_rows = (await db.execute(recent_sql, params)).fetchall()

    chart_sql = text("""
        SELECT session_date, AVG(overall_score) AS avg_score
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
        GROUP BY session_date
        ORDER BY session_date
    """)
    chart_rows = (await db.execute(chart_sql, params)).fetchall()

    return {
        "seller": {"id": seller_id},
        "stats": {
            "total_conversations": stats.total_conversations if stats else 0,
            "avg_score": round(float(stats.avg_score), 1) if stats else 0,
            "conversion_rate": round(float(stats.conversion_rate), 4) if stats else 0,
        },
        "stage_breakdown": [
            {"step_name": r.step_name, "avg_score": round(float(r.avg_score), 1)}
            for r in stage_rows
        ],
        "recent_conversations": [
            {
                "id": r.id,
                "session_date": str(r.session_date),
                "overall_score": float(r.overall_score) if r.overall_score else None,
                "outcome": r.outcome,
            }
            for r in recent_rows
        ],
        "score_chart": [
            {"date": str(r.session_date), "avg_score": round(float(r.avg_score), 1)}
            for r in chart_rows
        ],
    }
