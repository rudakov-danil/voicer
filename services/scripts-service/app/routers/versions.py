import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ScriptTemplate, ScriptStep, ScriptTemplateVersion
from app.routers.templates import _create_version, _get_visible_template

router = APIRouter(prefix="/api/v1/scripts/templates", tags=["versions"])


@router.get("/{template_id}/versions")
async def list_versions(
    template_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """История версий шаблона. Возвращает список без snapshot-полного содержимого."""
    template = await _get_visible_template(template_id, user, db)
    q = (
        select(ScriptTemplateVersion)
        .where(ScriptTemplateVersion.template_id == template.id)
        .order_by(ScriptTemplateVersion.version_number.desc())
    )
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": v.id,
                "template_id": v.template_id,
                "version_number": v.version_number,
                "note": v.note,
                "created_by": v.created_by,
                "created_at": v.created_at,
            }
            for v in rows
        ]
    }


@router.get("/{template_id}/versions/{version_number}")
async def get_version(
    template_id: uuid.UUID,
    version_number: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Полное содержимое (snapshot) конкретной версии."""
    template = await _get_visible_template(template_id, user, db)
    v = (await db.execute(
        select(ScriptTemplateVersion)
        .where(
            ScriptTemplateVersion.template_id == template.id,
            ScriptTemplateVersion.version_number == version_number,
        )
    )).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return {
        "id": v.id,
        "template_id": v.template_id,
        "version_number": v.version_number,
        "note": v.note,
        "created_by": v.created_by,
        "created_at": v.created_at,
        "snapshot": v.snapshot,
    }


@router.post("/{template_id}/versions/{version_number}/restore")
async def restore_version(
    template_id: uuid.UUID,
    version_number: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Восстанавливает шаблон в состояние выбранной версии.
    Это НЕ удаляет другие версии — создаёт новую версию-копию и обновляет шаблон.
    """
    if user["role"] not in ("director", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient role")

    template = await _get_visible_template(template_id, user, db)
    if user["role"] not in ("director", "admin") and str(template.created_by) != user["sub"]:
        raise HTTPException(status_code=403, detail="Not allowed to modify this template")

    target = (await db.execute(
        select(ScriptTemplateVersion)
        .where(
            ScriptTemplateVersion.template_id == template.id,
            ScriptTemplateVersion.version_number == version_number,
        )
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Version not found")

    snap = target.snapshot or {}

    # Обновляем шаблон полями из снимка
    template.name = snap.get("name", template.name)
    template.description = snap.get("description", template.description)
    template.context_description = snap.get("context_description", template.context_description)
    template.updated_at = datetime.utcnow()

    # Полностью пересоздаём этапы
    for step in list(template.steps):
        await db.delete(step)
    await db.flush()

    for i, sd in enumerate(snap.get("steps") or []):
        db.add(ScriptStep(
            template_id=template.id,
            name=sd.get("name") or f"Этап {i+1}",
            description=sd.get("description"),
            weight=float(sd.get("weight") or 0),
            is_required=bool(sd.get("is_required", True)),
            step_order=i + 1,
            recommendation_text=sd.get("recommendation_text"),
            example_phrases=sd.get("example_phrases") or [],
        ))

    await db.flush()
    # Фиксируем новую версию (копия восстановленного состояния)
    refreshed = (await db.execute(
        select(ScriptTemplate)
        .options(selectinload(ScriptTemplate.steps))
        .where(ScriptTemplate.id == template.id)
    )).scalar_one()
    await _create_version(db, refreshed, user, note=f"restored from v{version_number}")

    await db.commit()

    final = await _get_visible_template(template.id, user, db)
    from app.routers.templates import _template_detail
    return _template_detail(final)
