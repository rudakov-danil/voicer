import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions

router = APIRouter(prefix="/api/v1/dashboard/compliance", tags=["compliance-analytics"])


@router.get("/summary")
async def compliance_summary(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    recent_limit: int = Query(default=30, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Сводка по нарушениям комплаенса за период:
    - метрики: всего разговоров, разговоров с нарушениями, всего фактов нарушений;
    - распределение по правилам: rule_id, title, severity, count, affected_conversations;
    - последние N нарушений с привязкой к разговору, продавцу и магазину.
    """
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    where = "c.organization_id = :org_id AND c.session_date >= :df AND c.session_date <= :dt"
    params = {
        "org_id": uuid.UUID(org_id),
        "df": date_from,
        "dt": date_to,
        "recent_limit": recent_limit,
    }
    if effective_store_id:
        where += " AND c.store_id = :store_id"
        params["store_id"] = effective_store_id

    # Тоталы: разговоров и разговоров с нарушениями
    totals_sql = text(f"""
        SELECT
            COUNT(*)                                                            AS total_conversations,
            COUNT(*) FILTER (
                WHERE EXISTS(
                    SELECT 1 FROM analytics.conversation_compliance_violations v
                    WHERE v.conversation_id = c.id
                )
            )                                                                   AS conversations_with_violations,
            COALESCE(SUM((
                SELECT COUNT(*) FROM analytics.conversation_compliance_violations v
                WHERE v.conversation_id = c.id
            )), 0)                                                              AS total_violations
        FROM analytics.conversations c
        WHERE {where}
    """)
    totals = (await db.execute(totals_sql, params)).fetchone()

    # По правилам
    by_rule_sql = text(f"""
        SELECT
            v.rule_id,
            v.rule_title,
            v.severity,
            COUNT(*)                            AS count,
            COUNT(DISTINCT v.conversation_id)   AS affected_conversations
        FROM analytics.conversation_compliance_violations v
        JOIN analytics.conversations c ON c.id = v.conversation_id
        WHERE {where}
        GROUP BY v.rule_id, v.rule_title, v.severity
        ORDER BY count DESC
    """)
    by_rule_rows = (await db.execute(by_rule_sql, params)).fetchall()
    by_rule = [
        {
            "rule_id": str(r.rule_id),
            "rule_title": r.rule_title,
            "severity": r.severity,
            "count": int(r.count),
            "affected_conversations": int(r.affected_conversations),
        }
        for r in by_rule_rows
    ]

    # Последние факты
    recent_sql = text(f"""
        SELECT
            v.id, v.rule_id, v.rule_title, v.severity, v.evidence, v.explanation,
            c.id AS conv_id, c.session_date, c.topic, c.outcome,
            s.first_name AS seller_first_name, s.last_name AS seller_last_name,
            st.name AS store_name
        FROM analytics.conversation_compliance_violations v
        JOIN analytics.conversations c ON c.id = v.conversation_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        WHERE {where}
        ORDER BY c.session_date DESC, c.analyzed_at DESC
        LIMIT :recent_limit
    """)
    recent_rows = (await db.execute(recent_sql, params)).fetchall()
    recent = [
        {
            "id": str(r.id),
            "rule_id": str(r.rule_id),
            "rule_title": r.rule_title,
            "severity": r.severity,
            "evidence": r.evidence or "",
            "explanation": r.explanation or "",
            "conversation_id": str(r.conv_id),
            "session_date": str(r.session_date),
            "topic": r.topic,
            "outcome": r.outcome,
            "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            "store_name": r.store_name,
        }
        for r in recent_rows
    ]

    return {
        "period": {"date_from": str(date_from), "date_to": str(date_to)},
        "totals": {
            "total_conversations": int(totals.total_conversations or 0),
            "conversations_with_violations": int(totals.conversations_with_violations or 0),
            "total_violations": int(totals.total_violations or 0),
        },
        "by_rule": by_rule,
        "recent": recent,
    }


# ─── Аналитика по нарушениям скриптов и неотработанным возражениям ─────────

@router.get("/script-issues-summary")
async def script_issues_summary(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    recent_limit: int = Query(default=100, ge=1, le=300),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Сводка по «нарушениям скриптов» (replies в script_results.violations) и
    неотработанным возражениям. Используется во второй вкладке таблицы на странице
    комплаенса — там, где раньше показывались факты, не относящиеся к правилам
    коммуникации.
    """
    org_id, forced_store_id = org_store_conditions(user)
    effective_store_id = forced_store_id or store_id

    if date_from is None:
        date_from = date.today() - timedelta(days=30)
    if date_to is None:
        date_to = date.today()

    where = "c.organization_id = :org_id AND c.session_date >= :df AND c.session_date <= :dt"
    params = {
        "org_id": uuid.UUID(org_id),
        "df": date_from,
        "dt": date_to,
        "recent_limit": recent_limit,
    }
    if effective_store_id:
        where += " AND c.store_id = :store_id"
        params["store_id"] = effective_store_id

    # Тоталы: разговоров; с проблемами скриптов; всего фактов (script_violations + objections)
    totals_sql = text(f"""
        WITH conv_filtered AS (
            SELECT c.id FROM analytics.conversations c WHERE {where}
        ),
        script_facts AS (
            SELECT csr.conversation_id, csr.script_name, unnest(csr.violations) AS violation_text
            FROM analytics.conversation_script_results csr
            JOIN conv_filtered cf ON cf.id = csr.conversation_id
            WHERE cardinality(csr.violations) > 0
        ),
        obj_facts AS (
            SELECT o.conversation_id, o.type, o.raw_text
            FROM analytics.objections o
            JOIN conv_filtered cf ON cf.id = o.conversation_id
            WHERE o.is_resolved = FALSE
        )
        SELECT
            (SELECT COUNT(*) FROM conv_filtered)                                                   AS total_conversations,
            (SELECT COUNT(*) FROM (
                SELECT conversation_id FROM script_facts
                UNION
                SELECT conversation_id FROM obj_facts
            ) AS sub)                                                                              AS conversations_with_issues,
            (SELECT COUNT(*) FROM script_facts)                                                    AS script_violations_count,
            (SELECT COUNT(*) FROM obj_facts)                                                       AS unresolved_objections_count
    """)
    totals = (await db.execute(totals_sql, params)).fetchone()

    # Последние факты — UNION ALL по script_violations и unresolved objections,
    # сортируем по дате разговора, нумеруем для UI стабильности.
    recent_sql = text(f"""
        WITH conv_filtered AS (
            SELECT c.id, c.session_date, c.analyzed_at, c.topic, c.outcome, c.seller_id, c.store_id
            FROM analytics.conversations c WHERE {where}
        ),
        items AS (
            SELECT
                'script'::text AS kind,
                csr.conversation_id AS conv_id,
                csr.script_name AS script_name,
                NULL::text AS objection_type,
                v.violation_text AS text,
                idx AS sort_idx
            FROM analytics.conversation_script_results csr
            JOIN conv_filtered cf ON cf.id = csr.conversation_id
            CROSS JOIN LATERAL unnest(csr.violations) WITH ORDINALITY AS v(violation_text, idx)
            WHERE cardinality(csr.violations) > 0
            UNION ALL
            SELECT
                'objection'::text AS kind,
                o.conversation_id AS conv_id,
                NULL::text AS script_name,
                o.type AS objection_type,
                o.raw_text AS text,
                o.sort_order AS sort_idx
            FROM analytics.objections o
            JOIN conv_filtered cf ON cf.id = o.conversation_id
            WHERE o.is_resolved = FALSE
        )
        SELECT
            i.kind, i.conv_id, i.script_name, i.objection_type, i.text, i.sort_idx,
            cf.session_date, cf.topic, cf.outcome,
            s.first_name AS seller_first_name, s.last_name AS seller_last_name,
            st.name AS store_name
        FROM items i
        JOIN conv_filtered cf ON cf.id = i.conv_id
        LEFT JOIN admin_schema.sellers s ON s.id = cf.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = cf.store_id
        ORDER BY cf.session_date DESC, cf.analyzed_at DESC, i.sort_idx
        LIMIT :recent_limit
    """)
    recent_rows = (await db.execute(recent_sql, params)).fetchall()
    recent = [
        {
            "kind": r.kind,  # "script" | "objection"
            "conversation_id": str(r.conv_id),
            "session_date": str(r.session_date),
            "topic": r.topic,
            "outcome": r.outcome,
            "seller_name": f"{r.seller_first_name or ''} {r.seller_last_name or ''}".strip() or None,
            "store_name": r.store_name,
            "script_name": r.script_name,
            "objection_type": r.objection_type,
            "text": r.text,
        }
        for r in recent_rows
    ]

    return {
        "period": {"date_from": str(date_from), "date_to": str(date_to)},
        "totals": {
            "total_conversations": int(totals.total_conversations or 0),
            "conversations_with_issues": int(totals.conversations_with_issues or 0),
            "script_violations_count": int(totals.script_violations_count or 0),
            "unresolved_objections_count": int(totals.unresolved_objections_count or 0),
        },
        "recent": recent,
    }
