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
            COALESCE(p.prev_avg_score, 0) AS prev_avg_score,
            s.first_name AS seller_first_name,
            s.last_name AS seller_last_name,
            s.store_id,
            st.name AS store_name
        FROM current_period c
        LEFT JOIN prev_period p ON c.seller_id = p.seller_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = s.store_id
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
            "first_name": row.seller_first_name or "",
            "last_name": row.seller_last_name or "",
            "store_id": str(row.store_id) if row.store_id else None,
            "store_name": row.store_name or "",
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

    # Предыдущий период такой же длины — для тренда score
    period_days = (date_to - date_from).days or 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_days)

    params = {
        "org_id": uuid.UUID(org_id),
        "seller_id": seller_id,
        "date_from": date_from,
        "date_to": date_to,
        "prev_from": prev_from,
        "prev_to": prev_to,
    }

    # Базовый профиль: имя, магазин
    profile_sql = text("""
        SELECT s.id, s.first_name, s.last_name, s.store_id, st.name AS store_name
        FROM admin_schema.sellers s
        LEFT JOIN admin_schema.stores st ON st.id = s.store_id
        WHERE s.id = :seller_id AND s.organization_id = :org_id
    """)
    profile = (await db.execute(profile_sql, params)).fetchone()

    stats_sql = text("""
        SELECT
            COUNT(*) AS total_conversations,
            COALESCE(AVG(overall_score), 0) AS avg_score,
            CASE WHEN COUNT(*) > 0
                 THEN SUM(CASE WHEN outcome = 'purchase' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)
                 ELSE 0 END AS conversion_rate,
            SUM(CASE WHEN overall_score >= 70 THEN 1 ELSE 0 END) AS strong_count,
            (
                SELECT COUNT(*) FROM analytics.conversation_compliance_violations v
                JOIN analytics.conversations c2 ON c2.id = v.conversation_id
                WHERE c2.organization_id = :org_id
                  AND c2.seller_id = :seller_id
                  AND c2.session_date BETWEEN :date_from AND :date_to
            ) AS compliance_violations_count
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :date_from AND :date_to
    """)
    stats = (await db.execute(stats_sql, params)).fetchone()

    prev_stats_sql = text("""
        SELECT COALESCE(AVG(overall_score), 0) AS prev_avg_score
        FROM analytics.conversations
        WHERE organization_id = :org_id
          AND seller_id = :seller_id
          AND session_date BETWEEN :prev_from AND :prev_to
    """)
    prev_stats = (await db.execute(prev_stats_sql, params)).fetchone()
    score_trend = round(
        float(stats.avg_score) - float(prev_stats.prev_avg_score), 1
    ) if stats and prev_stats and prev_stats.prev_avg_score else 0.0

    # Этапы скрипта — группируем по конкретному скрипту, чтобы на сайдбаре
    # семантически похожие этапы из разных скриптов («Презентация товара»
    # vs «Презентация продукта») не смешивались в одну плоскую кашу.
    #
    # ВАЖНО: фильтруем по АКТУАЛЬНЫМ назначениям скрипта. Иначе исторические
    # данные показываются у продавцов, к которым скрипт уже не применяется
    # (был отключён или назначен на другой магазин). Скрипт «виден» для
    # продавца, если он is_active AND одно из:
    #  - applies_to_all_stores
    #  - есть прямое назначение seller_script_assignments
    #  - есть назначение через магазин продавца store_script_assignments
    stage_sql = text("""
        SELECT
            cs.script_template_id,
            cs.step_name,
            AVG(cs.score) AS avg_score,
            COUNT(*) AS sample_count,
            COALESCE(t.short_name, t.name) AS script_label,
            t.name AS script_name
        FROM analytics.conversations c
        JOIN analytics.conversation_scores cs ON cs.conversation_id = c.id
        JOIN scripts.script_templates t ON t.id = cs.script_template_id
        WHERE c.organization_id = :org_id
          AND c.seller_id = :seller_id
          AND c.session_date BETWEEN :date_from AND :date_to
          AND t.is_active = TRUE
          AND (
            t.applies_to_all_stores = TRUE
            OR EXISTS (
                SELECT 1 FROM scripts.seller_script_assignments sa
                WHERE sa.seller_id = c.seller_id AND sa.template_id = t.id
            )
            OR EXISTS (
                SELECT 1 FROM scripts.store_script_assignments sta
                WHERE sta.store_id = c.store_id AND sta.template_id = t.id
            )
          )
        GROUP BY cs.script_template_id, cs.step_name, t.name, t.short_name
        ORDER BY script_label NULLS LAST, avg_score
    """)
    stage_rows = (await db.execute(stage_sql, params)).fetchall()

    recent_sql = text("""
        SELECT
            c.id, c.session_date, c.analyzed_at, c.overall_score, c.outcome, c.topic,
            r.duration_seconds
        FROM analytics.conversations c
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        WHERE c.organization_id = :org_id
          AND c.seller_id = :seller_id
          AND c.session_date BETWEEN :date_from AND :date_to
        ORDER BY c.session_date DESC, c.analyzed_at DESC
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

    # Группировка этапов по скрипту → [{script_id, script_name, steps: [...]}]
    stage_groups: dict = {}
    for r in stage_rows:
        key = str(r.script_template_id) if r.script_template_id else "_unknown"
        if key not in stage_groups:
            stage_groups[key] = {
                "script_id": str(r.script_template_id) if r.script_template_id else None,
                "script_name": r.script_label or r.script_name or "Без скрипта",
                "script_full_name": r.script_name,
                "steps": [],
            }
        stage_groups[key]["steps"].append({
            "step_name": r.step_name,
            "avg_score": round(float(r.avg_score), 1),
            "sample_count": int(r.sample_count or 0),
        })
    stage_breakdown_grouped = list(stage_groups.values())

    # Рекомендации — простые эвристики на основе самого слабого этапа и компleance.
    recommendations: list[dict] = []
    weak_steps = [r for r in stage_rows if float(r.avg_score) < 60]
    if weak_steps:
        worst = weak_steps[0]
        script_hint = f" (скрипт «{worst.script_label}»)" if worst.script_label else ""
        recommendations.append({
            "severity": "warning",
            "text": f"Слабый этап — «{worst.step_name}»{script_hint}: средний {round(float(worst.avg_score), 1)}%. Стоит отработать.",
        })
    if stats and stats.compliance_violations_count and int(stats.compliance_violations_count) > 0:
        recommendations.append({
            "severity": "warning",
            "text": f"Зафиксировано {int(stats.compliance_violations_count)} нарушений правил коммуникации за период.",
        })
    if stats and float(stats.avg_score) >= 80 and not recommendations:
        recommendations.append({
            "severity": "info",
            "text": "Стабильно высокий скоринг — продавец работает в зелёной зоне.",
        })

    return {
        "seller": {
            "id": str(seller_id),
            "first_name": profile.first_name if profile else "",
            "last_name": profile.last_name if profile else "",
            "store_id": str(profile.store_id) if profile and profile.store_id else None,
            "store_name": profile.store_name if profile else None,
        },
        "stats": {
            "total_conversations": int(stats.total_conversations or 0) if stats else 0,
            "avg_score": round(float(stats.avg_score), 1) if stats else 0,
            "conversion_rate": round(float(stats.conversion_rate), 4) if stats else 0,
            "strong_count": int(stats.strong_count or 0) if stats else 0,
            "compliance_violations_count": int(stats.compliance_violations_count or 0) if stats else 0,
            "score_trend": score_trend,
        },
        "stage_breakdown": stage_breakdown_grouped,
        "recent_conversations": [
            {
                "id": str(r.id),
                "session_date": str(r.session_date),
                "topic": r.topic,
                "overall_score": float(r.overall_score) if r.overall_score is not None else None,
                "outcome": r.outcome,
                "duration_seconds": int(r.duration_seconds or 0) if r.duration_seconds else None,
            }
            for r in recent_rows
        ],
        "recommendations": recommendations,
        "score_chart": [
            {"date": str(r.session_date), "avg_score": round(float(r.avg_score), 1)}
            for r in chart_rows
        ],
    }
