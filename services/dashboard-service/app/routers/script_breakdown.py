"""Разбор скрипта по продавцам (ui-concept/scripts.html): тепловая карта
«продавец × этап», медиана сети и лучший пример на каждом этапе."""
import uuid
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.dependencies import get_current_user, org_store_conditions
from app import fingerprint as fp
from app.routers.sellers import _median

router = APIRouter(prefix="/api/v1/dashboard/scripts", tags=["scripts"])


@router.get("/{template_id}/breakdown")
async def script_breakdown(
    template_id: uuid.UUID,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id, forced_store_id = org_store_conditions(user)
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=30)
    params: dict = {"org_id": uuid.UUID(org_id), "tpl": template_id, "date_from": date_from, "date_to": date_to}
    scope = "c.organization_id = :org_id AND c.session_date BETWEEN :date_from AND :date_to AND c.is_scorable"
    if forced_store_id:
        scope += " AND c.store_id = :store_id"
        params["store_id"] = forced_store_id

    tpl = (await db.execute(text("""
        SELECT id, name FROM scripts.script_templates WHERE id = :tpl AND organization_id = :org_id
    """), params)).fetchone()
    if not tpl:
        raise HTTPException(status_code=404, detail="Script not found")

    steps = (await db.execute(text("""
        SELECT name, step_order, weight, is_required, COALESCE(recommendation_text, description) AS hint
        FROM scripts.script_steps WHERE template_id = :tpl ORDER BY step_order
    """), params)).fetchall()
    names = {s.name for s in steps}

    rows = (await db.execute(text(f"""
        SELECT c.seller_id, cs.step_name, AVG(cs.score) AS avg_score, COUNT(*) AS n,
               TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS seller_name,
               st.name AS store_name
        FROM analytics.conversation_scores cs
        JOIN analytics.conversations c ON c.id = cs.conversation_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = s.store_id
        WHERE {scope} AND cs.script_template_id = :tpl
        GROUP BY c.seller_id, cs.step_name, s.first_name, s.last_name, st.name
    """), params)).fetchall()
    totals = {r.seller_id: r for r in (await db.execute(text(f"""
        SELECT c.seller_id, COUNT(DISTINCT c.id) AS conversations, AVG(csr.script_score) AS script_score
        FROM analytics.conversation_script_results csr
        JOIN analytics.conversations c ON c.id = csr.conversation_id
        WHERE {scope} AND csr.script_template_id = :tpl
        GROUP BY c.seller_id
    """), params)).fetchall()}

    sellers: dict = {}
    for r in rows:
        if names and r.step_name not in names:
            continue  # этап прежней версии скрипта
        s = sellers.setdefault(r.seller_id, {
            "seller_id": r.seller_id,
            "seller_name": r.seller_name or None,
            "store_name": r.store_name,
            "conversations": totals[r.seller_id].conversations if r.seller_id in totals else 0,
            "script_score": round(float(totals[r.seller_id].script_score), 1)
            if r.seller_id in totals and totals[r.seller_id].script_score is not None else None,
            "steps": {},
        })
        s["steps"][r.step_name] = round(float(r.avg_score), 1)

    step_names = [s.name for s in steps] or sorted({r.step_name for r in rows})
    medians = {
        n: (round(m, 1) if (m := _median([s["steps"][n] for s in sellers.values() if n in s["steps"]])) is not None else None)
        for n in step_names
    }

    # Лучший пример на этапе: самый высокий балл с цитатой, момент — по совпадению цитаты с репликой
    examples: dict = {}
    for name in step_names:
        ex = (await db.execute(text(f"""
            SELECT c.id, c.transcript_id, cs.score, cs.evidence_text,
                   TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS seller_name
            FROM analytics.conversation_scores cs
            JOIN analytics.conversations c ON c.id = cs.conversation_id
            LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
            WHERE {scope} AND cs.script_template_id = :tpl AND cs.step_name = :step
              AND cs.evidence_text IS NOT NULL AND cs.evidence_text <> ''
            ORDER BY cs.score DESC, c.session_date DESC
            LIMIT 1
        """), {**params, "step": name})).fetchone()
        if not ex:
            continue
        t = None
        if ex.transcript_id:
            segs = (await db.execute(text("""
                SELECT start_ms, text FROM transcription.transcript_segments
                WHERE transcript_id = :tid ORDER BY segment_index
            """), {"tid": ex.transcript_id})).fetchall()
            t = fp.locate(ex.evidence_text, segs)
        examples[name] = {
            "conversation_id": ex.id,
            "seller_name": ex.seller_name or None,
            "score": round(float(ex.score), 1),
            "evidence": ex.evidence_text,
            "t": round(t) if t is not None else None,
        }

    return {
        "script": {"id": tpl.id, "name": tpl.name},
        "steps": [
            {
                "name": n,
                "order": next((s.step_order for s in steps if s.name == n), None),
                "weight": next((float(s.weight) for s in steps if s.name == n), None),
                "required": next((s.is_required for s in steps if s.name == n), True),
                "hint": next((s.hint for s in steps if s.name == n), None),
                "median": medians.get(n),
                "example": examples.get(n),
            }
            for n in step_names
        ],
        "sellers": sorted(sellers.values(), key=lambda s: -(s["script_score"] or 0)),
    }
