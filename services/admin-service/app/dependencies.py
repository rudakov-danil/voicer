from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)

# Синтетический пользователь для внутренних вызовов между сервисами
SERVICE_USER = {"sub": "service", "role": "service", "organization_id": None}


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> dict:
    # Внутренний вызов от другого сервиса/воркера
    if x_internal_key:
        if settings.INTERNAL_SERVICE_KEY and x_internal_key == settings.INTERNAL_SERVICE_KEY:
            return SERVICE_USER
        raise HTTPException(status_code=403, detail="Invalid internal service key")

    # Обычный JWT от фронтенда/пользователя
    if not credentials:
        raise HTTPException(status_code=401, detail="Unauthorized")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{settings.AUTH_SERVICE_URL}/api/v1/auth/verify",
            headers={"Authorization": f"Bearer {credentials.credentials}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return resp.json()["payload"]


def require_role(*roles: str):
    async def _check(user: dict = Depends(get_current_user)):
        # Внутренние сервисы имеют доступ ко всему
        if user["role"] == "service":
            return user
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check
