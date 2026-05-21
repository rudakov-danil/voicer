from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models import AlertSettings, PrivacySettings
from app.schemas import (
    AlertSettingsResponse, AlertSettingsUpdateRequest,
    PrivacySettingsResponse, PrivacySettingsUpdateRequest,
)

router = APIRouter(prefix="/api/v1/admin/settings", tags=["settings"])


@router.get("/privacy", response_model=PrivacySettingsResponse)
async def get_privacy_settings(
    store_id: Optional[UUID] = Query(default=None),
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    q = select(PrivacySettings).where(
        PrivacySettings.organization_id == current_user["organization_id"],
        PrivacySettings.store_id == store_id,
    )
    settings_obj = (await db.execute(q)).scalar_one_or_none()

    if not settings_obj:
        # Return defaults
        return PrivacySettingsResponse(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            organization_id=UUID(current_user["organization_id"]),
            store_id=store_id,
            retention_days=90,
            anonymize_transcripts=False,
            consent_required=True,
        )
    return PrivacySettingsResponse.model_validate(settings_obj)


@router.put("/privacy", response_model=PrivacySettingsResponse)
async def update_privacy_settings(
    body: PrivacySettingsUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(PrivacySettings).where(
            PrivacySettings.organization_id == current_user["organization_id"],
            PrivacySettings.store_id == body.store_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.retention_days = body.retention_days
        existing.anonymize_transcripts = body.anonymize_transcripts
        existing.consent_required = body.consent_required
        await db.commit()
        await db.refresh(existing)
        return PrivacySettingsResponse.model_validate(existing)
    else:
        new_settings = PrivacySettings(
            organization_id=current_user["organization_id"],
            store_id=body.store_id,
            retention_days=body.retention_days,
            anonymize_transcripts=body.anonymize_transcripts,
            consent_required=body.consent_required,
        )
        db.add(new_settings)
        await db.commit()
        await db.refresh(new_settings)
        return PrivacySettingsResponse.model_validate(new_settings)


@router.get("/alerts", response_model=AlertSettingsResponse)
async def get_alert_settings(
    store_id: Optional[UUID] = Query(default=None),
    current_user: dict = Depends(require_role("director", "admin", "rop")),
    db: AsyncSession = Depends(get_db),
):
    alert = (await db.execute(
        select(AlertSettings).where(
            AlertSettings.organization_id == current_user["organization_id"],
            AlertSettings.store_id == store_id,
        )
    )).scalar_one_or_none()

    if not alert:
        return AlertSettingsResponse(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            organization_id=UUID(current_user["organization_id"]),
            store_id=store_id,
            score_threshold=40,
            no_activity_hours=4,
            email_recipients=[],
            is_active=True,
        )
    return AlertSettingsResponse.model_validate(alert)


@router.put("/alerts", response_model=AlertSettingsResponse)
async def update_alert_settings(
    body: AlertSettingsUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(AlertSettings).where(
            AlertSettings.organization_id == current_user["organization_id"],
            AlertSettings.store_id == body.store_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.score_threshold = body.score_threshold
        existing.no_activity_hours = body.no_activity_hours
        existing.email_recipients = body.email_recipients
        existing.is_active = body.is_active
        await db.commit()
        await db.refresh(existing)
        return AlertSettingsResponse.model_validate(existing)
    else:
        new_alert = AlertSettings(
            organization_id=current_user["organization_id"],
            store_id=body.store_id,
            score_threshold=body.score_threshold,
            no_activity_hours=body.no_activity_hours,
            email_recipients=body.email_recipients,
            is_active=body.is_active,
        )
        db.add(new_alert)
        await db.commit()
        await db.refresh(new_alert)
        return AlertSettingsResponse.model_validate(new_alert)
