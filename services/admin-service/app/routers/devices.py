from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Device, Seller, Store
from app.schemas import (
    DeviceCreateRequest, DeviceListResponse, DeviceResponse,
    DeviceUpdateRequest, DeviceWithSellerResponse, SellerShort,
)

router = APIRouter(prefix="/api/v1/admin/devices", tags=["devices"])


def _apply_device_access(q, user: dict):
    role = user["role"]
    q = q.where(Device.organization_id == user["organization_id"])
    if role == "rop":
        q = q.where(Device.store_id.in_(user.get("rop_stores", [])))
    elif role == "manager":
        q = q.where(Device.store_id == user["store_id"])
    return q


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    store_id: UUID | None = Query(default=None),
    seller_id: UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Device)
    q = _apply_device_access(q, current_user)
    if store_id:
        q = q.where(Device.store_id == store_id)
    if seller_id:
        q = q.where(Device.seller_id == seller_id)
    if is_active is not None:
        q = q.where(Device.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    devices = (await db.execute(q.limit(limit).offset(offset))).scalars().all()

    return {"items": [DeviceResponse.model_validate(d) for d in devices], "total": total}


@router.post("", response_model=DeviceResponse, status_code=201)
async def create_device(
    body: DeviceCreateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(Device).where(Device.serial_number == body.serial_number)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Device with this serial number already exists")

    store = (await db.execute(
        select(Store).where(Store.id == body.store_id, Store.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    device = Device(
        organization_id=current_user["organization_id"],
        store_id=body.store_id,
        seller_id=body.seller_id,
        serial_number=body.serial_number,
        model=body.model,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return DeviceResponse.model_validate(device)


@router.patch("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: UUID,
    body: DeviceUpdateRequest,
    current_user: dict = Depends(require_role("director", "admin")),
    db: AsyncSession = Depends(get_db),
):
    device = (await db.execute(
        select(Device).where(Device.id == device_id, Device.organization_id == current_user["organization_id"])
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if body.seller_id is not None:
        device.seller_id = body.seller_id
    if body.store_id is not None:
        device.store_id = body.store_id
    if body.is_active is not None:
        device.is_active = body.is_active

    await db.commit()
    await db.refresh(device)
    return DeviceResponse.model_validate(device)


@router.get("/by-serial/{serial_number}", response_model=DeviceWithSellerResponse)
async def get_device_by_serial(
    serial_number: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Используется recorder-service для идентификации бейджа.
    Не требует JWT — аутентификация на стороне recorder-service по device_id.
    """
    device = (await db.execute(
        select(Device).where(Device.serial_number == serial_number)
    )).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.is_active:
        raise HTTPException(status_code=403, detail="Device is inactive")

    seller = None
    if device.seller_id:
        seller_obj = (await db.execute(
            select(Seller).where(Seller.id == device.seller_id)
        )).scalar_one_or_none()
        if seller_obj:
            seller = SellerShort(id=seller_obj.id, first_name=seller_obj.first_name, last_name=seller_obj.last_name)

    return DeviceWithSellerResponse(
        id=device.id,
        organization_id=device.organization_id,
        store_id=device.store_id,
        seller_id=device.seller_id,
        serial_number=device.serial_number,
        model=device.model,
        is_active=device.is_active,
        last_seen_at=device.last_seen_at,
        seller=seller,
    )
