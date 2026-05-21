"""Аналитика по этапам скрипта.
Читает analytics.conversation_scores напрямую — там по каждой конверсации хранится оценка
КАЖДОГО этапа (с template_id + step_id + score + step_detected).
"""
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.dependencies import get_current_user
from app.routers.templates import _get_visible_template

router = APIRouter(prefix="/api/v1/scripts/templates", tags=["analytics"])


@router.get("/{template_id}/analytics")
async def step_analytics(
    template_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    version_id: uuid.UUID | None = Query(default=None,
        description="Если задан — учитывать только разговоры, оценённые этой версией."),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await _get_visible_template(template_id, user, db)
    org_id = uuid.UUID(user["organization_id"])
    since = datetime.utcnow() - timedelta(days=days)

    # Общая статистика по разговорам, на которых этот скрипт был применён
    overall_sql = """
        SELECT
            COUNT(DISTINCT c.id)                                AS conversation_count,
            AVG(csr.script_score)                               AS avg_script_score,
            COUNT(DISTINCT c.id) FILTER (
                WHERE csr.script_score >= 70
            )                                                   AS strong_conv_count
        FROM analytics.conversations c
        JOIN analytics.conversation_script_results csr
            ON csr.conversation_id = c.id
        WHERE c.organization_id = :org_id
          AND csr.script_template_id = :template_id
          AND csr.was_applied = TRUE
          AND c.analyzed_at >= :since
    """
    params: dict = {"org_id": org_id, "template_id": template.id, "since": since}
    if version_id:
        overall_sql += " AND csr.script_template_version_id = :version_id"
        params["version_id"] = version_id

    overall = (await db.execute(text(overall_sql), params)).fetchone()

    # Per-step: группируем ТОЛЬКО по step_name, чтобы орфаны (с пересохранёнными
    # script_step_id после редактирования шаблона) схлопывались в один ряд.
    # Берём свежий step_id (MAX по дате через MAX(score_id) — для ссылок UI).
    per_step_sql = """
        SELECT
            cs.step_name                                   AS step_name,
            MAX(cs.script_step_id::text)                   AS step_id,
            AVG(cs.score)                                  AS avg_score,
            COUNT(*)                                       AS total_count,
            COUNT(*) FILTER (WHERE cs.score >= 50)         AS pass_count,
            COUNT(*) FILTER (WHERE cs.step_detected = TRUE) AS detected_count
        FROM analytics.conversation_scores cs
        JOIN analytics.conversations c ON c.id = cs.conversation_id
    """
    if version_id:
        per_step_sql += """
        JOIN analytics.conversation_script_results csr
            ON csr.conversation_id = c.id AND csr.script_template_id = cs.script_template_id
        """
    per_step_sql += """
        WHERE c.organization_id = :org_id
          AND cs.script_template_id = :template_id
          AND c.analyzed_at >= :since
    """
    if version_id:
        per_step_sql += " AND csr.script_template_version_id = :version_id"
    per_step_sql += """
        GROUP BY cs.step_name
        ORDER BY cs.step_name
    """
    rows = (await db.execute(text(per_step_sql), params)).fetchall()

    conv_count = int(overall.conversation_count or 0) if overall else 0
    avg_score = float(overall.avg_script_score) if overall and overall.avg_script_score is not None else None
    strong = int(overall.strong_conv_count or 0) if overall else 0

    return {
        "template_id": str(template.id),
        "period_days": days,
        "conversation_count": conv_count,
        "avg_script_score": round(avg_score, 1) if avg_score is not None else None,
        "strong_conversation_count": strong,
        "weak_conversation_count": max(conv_count - strong, 0),
        "per_step": [
            {
                "step_id": r.step_id,
                "step_name": r.step_name,
                "avg_score": round(float(r.avg_score), 1) if r.avg_score is not None else 0.0,
                "total_count": int(r.total_count),
                "pass_count": int(r.pass_count),
                "pass_rate": round(100.0 * int(r.pass_count) / int(r.total_count), 1) if r.total_count else 0.0,
                "detected_count": int(r.detected_count),
                "detection_rate": round(100.0 * int(r.detected_count) / int(r.total_count), 1) if r.total_count else 0.0,
            }
            for r in rows
        ],
    }


@router.get("/{template_id}/compare")
async def compare_versions(
    template_id: uuid.UUID,
    version_a: int = Query(..., description="Номер версии A"),
    version_b: int = Query(..., description="Номер версии B"),
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Side-by-side сравнение метрик двух версий скрипта."""
    template = await _get_visible_template(template_id, user, db)
    if version_a == version_b:
        raise HTTPException(status_code=422, detail="Versions must differ")

    # Найти id версий по номеру
    from app.models import ScriptTemplateVersion
    from sqlalchemy import select as sa_select
    versions = (await db.execute(
        sa_select(ScriptTemplateVersion)
        .where(
            ScriptTemplateVersion.template_id == template.id,
            ScriptTemplateVersion.version_number.in_([version_a, version_b]),
        )
    )).scalars().all()
    v_map = {v.version_number: v for v in versions}
    if version_a not in v_map or version_b not in v_map:
        raise HTTPException(status_code=404, detail="One or both versions not found")

    async def _stats(version_id) -> dict:
        # Считаем «эффективную версию» каждого разговора:
        # 1) если в csr.script_template_version_id уже стоит UUID — используем его (новые данные);
        # 2) иначе fallback по времени — последняя версия, созданная до c.analyzed_at
        #    (исторические разговоры до введения версионирования).
        sql = text("""
            WITH effective AS (
                SELECT
                    csr.conversation_id,
                    csr.script_score,
                    COALESCE(
                        csr.script_template_version_id,
                        (
                            SELECT stv.id
                            FROM scripts.script_template_versions stv
                            WHERE stv.template_id = csr.script_template_id
                              AND stv.created_at <= c.analyzed_at
                            ORDER BY stv.created_at DESC
                            LIMIT 1
                        )
                    ) AS effective_version_id
                FROM analytics.conversation_script_results csr
                JOIN analytics.conversations c ON c.id = csr.conversation_id
                WHERE c.organization_id = :org_id
                  AND csr.script_template_id = :template_id
                  AND csr.was_applied = TRUE
                  AND c.analyzed_at >= :since
            )
            SELECT
                COUNT(DISTINCT conversation_id)                                       AS conv_count,
                AVG(script_score)                                                     AS avg_score,
                COUNT(DISTINCT conversation_id) FILTER (WHERE script_score >= 70)     AS strong
            FROM effective
            WHERE effective_version_id = :version_id
        """)
        row = (await db.execute(sql, {
            "org_id": uuid.UUID(user["organization_id"]),
            "template_id": template.id,
            "version_id": version_id,
            "since": datetime.utcnow() - timedelta(days=days),
        })).fetchone()
        return {
            "conversation_count": int(row.conv_count or 0) if row else 0,
            "avg_script_score": round(float(row.avg_score), 1) if row and row.avg_score is not None else None,
            "strong_count": int(row.strong or 0) if row else 0,
        }

    a_stats = await _stats(v_map[version_a].id)
    b_stats = await _stats(v_map[version_b].id)

    return {
        "template_id": str(template.id),
        "period_days": days,
        "version_a": {"version_number": version_a, "id": str(v_map[version_a].id), **a_stats},
        "version_b": {"version_number": version_b, "id": str(v_map[version_b].id), **b_stats},
    }
