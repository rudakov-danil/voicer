import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ScriptTemplate, SellerScriptAssignment

router = APIRouter(prefix="/api/v1/scripts", tags=["for-seller"])


@router.get("/for-seller")
async def get_scripts_for_seller(
    seller_id: uuid.UUID = Query(...),
    organization_id: uuid.UUID = Query(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify organization matches JWT (service users bypass this check)
    if user["role"] != "service" and str(organization_id) != user["organization_id"]:
        return {"seller_id": seller_id, "scripts": []}

    # Load all active assignments with template and steps eagerly
    q = (
        select(SellerScriptAssignment)
        .where(
            SellerScriptAssignment.seller_id == seller_id,
            SellerScriptAssignment.organization_id == organization_id,
        )
        .join(ScriptTemplate)
        .where(ScriptTemplate.is_active == True)
        .options(
            selectinload(SellerScriptAssignment.template).selectinload(ScriptTemplate.steps)
        )
    )
    assignments = (await db.execute(q)).scalars().all()

    scripts = []
    for a in assignments:
        t = a.template
        scripts.append({
            "id": str(t.id),
            "name": t.name,
            "is_mandatory": a.is_mandatory,
            "context_description": t.context_description,
            "steps": [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "description": s.description,
                    "weight": float(s.weight),
                    "is_required": s.is_required,
                    "step_order": s.step_order,
                    "recommendation_text": s.recommendation_text,
                }
                for s in sorted(t.steps, key=lambda s: s.step_order)
            ],
        })

    return {"seller_id": seller_id, "scripts": scripts}
