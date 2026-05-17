import uuid
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.dependencies import get_current_user
from app.models import ScriptTemplate, StoreScriptAssignment
from app.schemas import StoreAssignmentCreate

router = APIRouter(prefix="/api/v1/scripts/store-assignments", tags=["store-assignments"])


@router.post("", status_code=201)
async def assign_script_to_store(
    body: StoreAssignmentCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    template = (await db.execute(
        select(ScriptTemplate).where(ScriptTemplate.id == body.template_id)
    )).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if str(template.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=403, detail="Cannot assign template from another organization")

    if user["role"] == "manager" and template.scope == "manager_level" and str(template.created_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Template not visible to you")

    assignment = StoreScriptAssignment(
        organization_id=uuid.UUID(user["organization_id"]),
        store_id=body.store_id,
        template_id=body.template_id,
        is_mandatory=body.is_mandatory,
        assigned_by=uuid.UUID(user["sub"]),
    )
    db.add(assignment)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Script already assigned to this store")

    await db.refresh(assignment)
    return {
        "id": assignment.id,
        "store_id": assignment.store_id,
        "template_id": assignment.template_id,
        "template_name": template.name,
        "scope": template.scope,
        "is_mandatory": assignment.is_mandatory,
        "assigned_at": assignment.assigned_at,
    }


@router.delete("/{assignment_id}", status_code=204)
async def remove_store_assignment(
    assignment_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    assignment = (await db.execute(
        select(StoreScriptAssignment).where(StoreScriptAssignment.id == assignment_id)
    )).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if str(assignment.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if user["role"] not in ("director", "admin") and str(assignment.assigned_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not allowed to remove this assignment")

    await db.delete(assignment)
    await db.commit()


@router.get("")
async def list_store_assignments(
    store_id: uuid.UUID | None = None,
    template_id: uuid.UUID | None = None,
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = uuid.UUID(user["organization_id"])
    q = (
        select(StoreScriptAssignment)
        .where(StoreScriptAssignment.organization_id == org_id)
        .options(selectinload(StoreScriptAssignment.template))
    )
    if store_id:
        q = q.where(StoreScriptAssignment.store_id == store_id)
    if template_id:
        q = q.where(StoreScriptAssignment.template_id == template_id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    assignments = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    items = [{
        "id": a.id,
        "store_id": a.store_id,
        "template_id": a.template_id,
        "template_name": a.template.name,
        "scope": a.template.scope,
        "is_mandatory": a.is_mandatory,
        "assigned_at": a.assigned_at,
    } for a in assignments]
    return {"items": items, "total": total}


@router.post("/bulk-set", status_code=200)
async def bulk_set_template_stores(
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Полностью переопределить набор магазинов для шаблона.
    body: { "template_id": "<uuid>", "store_ids": ["<uuid>", ...] }
    Удаляет лишние назначения и создаёт недостающие. Идемпотентно.
    """
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    try:
        template_id = uuid.UUID(body["template_id"])
        store_ids = {uuid.UUID(x) for x in (body.get("store_ids") or [])}
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid template_id/store_ids")

    org_id = uuid.UUID(user["organization_id"])
    template = (await db.execute(
        select(ScriptTemplate).where(ScriptTemplate.id == template_id)
    )).scalar_one_or_none()
    if template is None or str(template.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Template not found")
    if user["role"] == "manager" and template.scope == "manager_level" and str(template.created_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Template not visible to you")

    existing = (await db.execute(
        select(StoreScriptAssignment).where(
            StoreScriptAssignment.template_id == template_id,
            StoreScriptAssignment.organization_id == org_id,
        )
    )).scalars().all()
    existing_by_store = {a.store_id: a for a in existing}

    # Удаляем те, что больше не в наборе
    for store_id, a in existing_by_store.items():
        if store_id not in store_ids:
            await db.delete(a)

    # Добавляем недостающие
    for sid in store_ids:
        if sid not in existing_by_store:
            db.add(StoreScriptAssignment(
                organization_id=org_id,
                store_id=sid,
                template_id=template_id,
                is_mandatory=True,
                assigned_by=uuid.UUID(user["sub"]),
            ))

    await db.commit()
    return {"template_id": str(template_id), "assigned_store_count": len(store_ids)}
