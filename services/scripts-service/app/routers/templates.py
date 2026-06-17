import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.dependencies import get_current_user
from sqlalchemy import delete as sa_delete
from app.models import ScriptTemplate, ScriptStep, ScriptBlock, SellerScriptAssignment, StoreScriptAssignment, ScriptTemplateVersion
from app.schemas import TemplateCreate, TemplatePatch, TemplateListItem, TemplateDetail, AssignedSeller, ScriptStepOut
from app.validators import validate_weights_sum
from app.short_name import derive_short_name, heuristic_short_name

router = APIRouter(prefix="/api/v1/scripts/templates", tags=["templates"])


def _snapshot_payload(template: ScriptTemplate) -> dict:
    """Готовит JSON-снимок шаблона со всеми этапами на момент сохранения."""
    return {
        "name": template.name,
        "short_name": template.short_name,
        "description": template.description,
        "scope": template.scope,
        "context_description": template.context_description,
        "is_active": template.is_active,
        "applies_to_all_stores": template.applies_to_all_stores,
        "script_type": template.script_type,
        "source_document_name": template.source_document_name,
        "full_text": template.full_text,
        "steps": [
            {
                "id": str(s.id),
                "name": s.name,
                "description": s.description,
                "weight": float(s.weight),
                "is_required": s.is_required,
                "step_order": s.step_order,
                "recommendation_text": s.recommendation_text,
                "example_phrases": s.example_phrases or [],
            }
            for s in sorted(template.steps, key=lambda x: x.step_order)
        ],
        "blocks": [
            {
                "id": str(b.id),
                "title": b.title,
                "text": b.text,
                "block_type": b.block_type,
                "is_mandatory": b.is_mandatory,
                "block_order": b.block_order,
            }
            for b in sorted(template.blocks, key=lambda x: x.block_order)
        ],
    }


async def _create_version(
    db: AsyncSession, template: ScriptTemplate, user: dict, note: str | None = None,
) -> ScriptTemplateVersion:
    """Создаёт новую версию шаблона. Номер версии = max существующий + 1, либо 1."""
    max_v = (await db.execute(
        select(func.coalesce(func.max(ScriptTemplateVersion.version_number), 0))
        .where(ScriptTemplateVersion.template_id == template.id)
    )).scalar_one()
    version = ScriptTemplateVersion(
        template_id=template.id,
        version_number=int(max_v) + 1,
        snapshot=_snapshot_payload(template),
        note=note,
        created_by=uuid.UUID(user["sub"]),
    )
    db.add(version)
    return version


def _validate_template_body(body: TemplateCreate) -> None:
    """staged: сумма весов этапов = 1.0; fulltext: нужны блоки, этапы не используются."""
    if body.script_type == "fulltext":
        if not body.blocks:
            raise HTTPException(
                status_code=422,
                detail={"error": "NO_BLOCKS", "message": "Полнотекстовый скрипт должен содержать хотя бы один блок"},
            )
        if body.steps:
            raise HTTPException(
                status_code=422,
                detail={"error": "MIXED_TYPE", "message": "Полнотекстовый скрипт не может содержать этапы (steps)"},
            )
        return
    if body.script_type != "staged":
        raise HTTPException(status_code=422, detail={"error": "BAD_SCRIPT_TYPE", "message": "script_type должен быть staged или fulltext"})
    weights = [s.weight for s in body.steps]
    if not validate_weights_sum(weights):
        total = sum(weights)
        raise HTTPException(
            status_code=422,
            detail={"error": "INVALID_WEIGHTS", "message": f"Sum of step weights must equal 1.000, got {total:.3f}"},
        )


def _add_blocks(db: AsyncSession, template_id: uuid.UUID, body: TemplateCreate) -> None:
    for block_data in body.blocks:
        db.add(ScriptBlock(
            template_id=template_id,
            title=block_data.title[:255],
            text=block_data.text,
            block_type=block_data.block_type,
            is_mandatory=block_data.is_mandatory,
            block_order=block_data.block_order,
        ))


def _build_visibility_condition(user: dict):
    org_id = uuid.UUID(user["organization_id"])
    if user["role"] in ("director", "admin"):
        return ScriptTemplate.organization_id == org_id
    # manager: org_level + own manager_level
    return and_(
        ScriptTemplate.organization_id == org_id,
        or_(
            ScriptTemplate.scope == "org_level",
            and_(
                ScriptTemplate.scope == "manager_level",
                ScriptTemplate.created_by == uuid.UUID(user["sub"]),
            ),
        ),
    )


@router.get("")
async def list_templates(
    scope: str | None = None,
    is_active: bool | None = None,
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    condition = _build_visibility_condition(user)
    q = select(ScriptTemplate).options(
        selectinload(ScriptTemplate.steps),
        selectinload(ScriptTemplate.blocks),
        selectinload(ScriptTemplate.assignments),
        selectinload(ScriptTemplate.store_assignments),
    ).where(condition)
    if scope is not None:
        q = q.where(ScriptTemplate.scope == scope)
    if is_active is not None:
        q = q.where(ScriptTemplate.is_active == is_active)

    total_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(total_q)).scalar_one()

    q = q.offset(offset).limit(limit)
    templates = (await db.execute(q)).scalars().all()

    items = []
    for t in templates:
        step_count = len(t.steps)
        seller_count = len(t.assignments)
        items.append(TemplateListItem(
            id=t.id,
            name=t.name,
            short_name=t.short_name,
            description=t.description,
            scope=t.scope,
            script_type=t.script_type,
            is_active=t.is_active,
            step_count=step_count,
            block_count=len(t.blocks),
            seller_count=seller_count,
            created_at=t.created_at,
        ))

    return {"items": items, "total": total}


@router.post("", status_code=201)
async def create_template(
    body: TemplateCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Role check for scope
    if body.scope == "org_level" and user["role"] == "manager":
        raise HTTPException(status_code=403, detail="Managers cannot create org_level scripts")

    _validate_template_body(body)

    short = (body.short_name or '').strip() or await derive_short_name(body.name, body.description)
    template = ScriptTemplate(
        organization_id=uuid.UUID(user["organization_id"]),
        name=body.name,
        short_name=short,
        description=body.description,
        scope=body.scope,
        context_description=body.context_description,
        script_type=body.script_type,
        source_document_name=body.source_document_name,
        full_text=body.full_text,
        created_by=uuid.UUID(user["sub"]),
    )
    db.add(template)
    await db.flush()

    for step_data in body.steps:
        step = ScriptStep(
            template_id=template.id,
            name=step_data.name,
            description=step_data.description,
            weight=step_data.weight,
            is_required=step_data.is_required,
            step_order=step_data.step_order,
            recommendation_text=step_data.recommendation_text,
            example_phrases=step_data.example_phrases or [],
        )
        db.add(step)

    _add_blocks(db, template.id, body)

    await db.flush()
    # Подтягиваем steps/blocks в кэш сессии для snapshot — selectinload через ре-fetch
    seeded = (await db.execute(
        select(ScriptTemplate)
        .options(selectinload(ScriptTemplate.steps), selectinload(ScriptTemplate.blocks))
        .where(ScriptTemplate.id == template.id)
    )).scalar_one()
    await _create_version(db, seeded, user, note="initial")
    await db.commit()
    # Перетягиваем через visible_template — там selectinload подгрузит steps/assignments/store_assignments
    fresh = await _get_visible_template(template.id, user, db)
    return _template_detail(fresh)


@router.get("/{template_id}")
async def get_template(
    template_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await _get_visible_template(template_id, user, db)
    return _template_detail(template)


@router.put("/{template_id}")
async def replace_template(
    template_id: uuid.UUID,
    body: TemplateCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await _get_visible_template(template_id, user, db)

    # Only creator or director/admin can update
    if user["role"] not in ("director", "admin") and str(template.created_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not allowed to modify this template")

    # script_type шаблона не меняется; валидируем по типу самого шаблона
    body.script_type = template.script_type
    _validate_template_body(body)

    # Update template fields (scope and org_id cannot change)
    name_changed = template.name != body.name
    template.name = body.name
    template.description = body.description
    template.context_description = body.context_description
    if body.full_text is not None:
        template.full_text = body.full_text
    if body.source_document_name is not None:
        template.source_document_name = body.source_document_name
    # short_name: если явно прислали — обновляем. Если изменилось имя — перегенерируем.
    if body.short_name is not None and body.short_name.strip():
        template.short_name = body.short_name.strip()[:60]
    elif name_changed or not template.short_name:
        template.short_name = await derive_short_name(body.name, body.description)
    template.updated_at = datetime.utcnow()

    # Replace steps + blocks
    for step in list(template.steps):
        await db.delete(step)
    for block in list(template.blocks):
        await db.delete(block)
    await db.flush()

    for step_data in body.steps:
        step = ScriptStep(
            template_id=template.id,
            name=step_data.name,
            description=step_data.description,
            weight=step_data.weight,
            is_required=step_data.is_required,
            step_order=step_data.step_order,
            recommendation_text=step_data.recommendation_text,
            example_phrases=step_data.example_phrases or [],
        )
        db.add(step)

    _add_blocks(db, template.id, body)

    await db.flush()
    # Снимаем версию НОВОГО состояния — храним полную историю.
    # Важно: после delete+add на коллекции template.steps идентичный объект может
    # лежать в session с устаревшей relationship. Принудительно expire, чтобы
    # selectinload пересобрал steps из БД.
    db.expire(template, ["steps", "blocks"])
    refreshed = (await db.execute(
        select(ScriptTemplate)
        .options(selectinload(ScriptTemplate.steps), selectinload(ScriptTemplate.blocks))
        .where(ScriptTemplate.id == template.id)
    )).scalar_one()
    await _create_version(db, refreshed, user, note="edit")
    await db.commit()
    fresh = await _get_visible_template(template.id, user, db)
    return _template_detail(fresh)


@router.patch("/{template_id}")
async def patch_template(
    template_id: uuid.UUID,
    body: TemplatePatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await _get_visible_template(template_id, user, db)

    if user["role"] not in ("director", "admin") and str(template.created_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not allowed to modify this template")

    name_changed = False
    if body.name is not None:
        name_changed = template.name != body.name
        template.name = body.name
    if body.description is not None:
        template.description = body.description
    if body.is_active is not None:
        template.is_active = body.is_active
    if body.applies_to_all_stores is not None:
        template.applies_to_all_stores = body.applies_to_all_stores
    if body.short_name is not None:
        v = body.short_name.strip()
        template.short_name = v[:60] if v else heuristic_short_name(template.name)
    elif name_changed:
        # Имя поменялось через rename → пересчитаем short_name (LLM + fallback)
        template.short_name = await derive_short_name(template.name, template.description)
    template.updated_at = datetime.utcnow()

    await db.commit()
    fresh = await _get_visible_template(template.id, user, db)
    return _template_detail(fresh)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Удаляет шаблон вместе с его этапами, версиями и назначениями.
    Версии и этапы каскадно (CASCADE FK), назначения удаляем вручную (FK = RESTRICT).
    """
    template = await _get_visible_template(template_id, user, db)
    if user["role"] not in ("director", "admin") and str(template.created_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not allowed to delete this template")

    # Чистим назначения — у них FK с ondelete=RESTRICT, иначе CASCADE не сработает.
    await db.execute(sa_delete(SellerScriptAssignment).where(SellerScriptAssignment.template_id == template.id))
    await db.execute(sa_delete(StoreScriptAssignment).where(StoreScriptAssignment.template_id == template.id))
    await db.delete(template)
    await db.commit()


async def _get_visible_template(template_id: uuid.UUID, user: dict, db: AsyncSession) -> ScriptTemplate:
    result = await db.execute(
        select(ScriptTemplate)
        .options(
            selectinload(ScriptTemplate.steps),
            selectinload(ScriptTemplate.blocks),
            selectinload(ScriptTemplate.assignments),
            selectinload(ScriptTemplate.store_assignments),
        )
        .where(ScriptTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if str(template.organization_id) != user["organization_id"]:
        raise HTTPException(status_code=404, detail="Template not found")
    # visibility check
    if user["role"] not in ("director", "admin"):
        if template.scope == "manager_level" and str(template.created_by) != user["sub"]:
            raise HTTPException(status_code=404, detail="Template not found")
    return template


def _template_detail(template: ScriptTemplate) -> dict:
    return {
        "id": template.id,
        "name": template.name,
        "short_name": template.short_name,
        "description": template.description,
        "scope": template.scope,
        "context_description": template.context_description,
        "script_type": template.script_type,
        "source_document_name": template.source_document_name,
        "full_text": template.full_text,
        "is_active": template.is_active,
        "applies_to_all_stores": bool(getattr(template, "applies_to_all_stores", False)),
        "blocks": [
            {
                "id": b.id,
                "title": b.title,
                "text": b.text,
                "block_type": b.block_type,
                "is_mandatory": b.is_mandatory,
                "block_order": b.block_order,
            }
            for b in sorted(template.blocks, key=lambda x: x.block_order)
        ],
        "steps": [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "weight": float(s.weight),
                "is_required": s.is_required,
                "step_order": s.step_order,
                "recommendation_text": s.recommendation_text,
                "example_phrases": s.example_phrases or [],
            }
            for s in template.steps
        ],
        "assigned_sellers": [
            {"seller_id": a.seller_id, "is_mandatory": a.is_mandatory}
            for a in template.assignments
        ],
        "assigned_stores": [
            {"store_id": a.store_id, "is_mandatory": a.is_mandatory}
            for a in (template.store_assignments or [])
        ],
    }
