"""Настройки сети, которые нужны графикам: часовой пояс (auth.organizations.timezone).

Сеть в Казахстане смотрит «по часам» в Asia/Almaty, московская — в Europe/Moscow. Не задан —
LOCAL_TZ сервиса. Значение кэшируется на пять минут: меняется редко, а читается в каждом отчёте.
"""
import time
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

_TTL = 300
_cache: dict[str, tuple[float, str]] = {}


async def org_tz(db: AsyncSession, org_id) -> str:
    key = str(org_id)
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    try:
        tz = (await db.execute(text("SELECT timezone FROM auth.organizations WHERE id = :id"),
                               {"id": uuid.UUID(key)})).scalar()
    except Exception:
        # Колонки ещё нет (миграция auth 0005 не применена) — работаем по-старому
        await db.rollback()
        tz = None
    tz = tz or settings.LOCAL_TZ
    _cache[key] = (time.monotonic() + _TTL, tz)
    return tz
