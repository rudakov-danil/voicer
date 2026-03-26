from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AudioChunk


class DeviceRecord:
    def __init__(self, id, organization_id, store_id, seller_id, serial_number, is_active):
        self.id = id
        self.organization_id = organization_id
        self.store_id = store_id
        self.seller_id = seller_id
        self.serial_number = serial_number
        self.is_active = is_active


import httpx
from app.config import settings


async def verify_device(device_id: str) -> DeviceRecord | None:
    """
    Проверяет device_id через admin-service.
    Возвращает DeviceRecord если устройство найдено и активно, иначе None.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.ADMIN_SERVICE_URL}/api/v1/admin/devices/by-serial/{device_id}",
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data.get("is_active", False):
            return None
        return DeviceRecord(
            id=UUID(data["id"]),
            organization_id=UUID(data["organization_id"]),
            store_id=UUID(data["store_id"]),
            seller_id=UUID(data["seller_id"]) if data.get("seller_id") else None,
            serial_number=data["serial_number"],
            is_active=data["is_active"],
        )
    except Exception:
        return None
