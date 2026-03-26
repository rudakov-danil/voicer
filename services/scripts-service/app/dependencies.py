from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)

SERVICE_USER = {"sub": "service", "role": "service", "organization_id": None}


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> dict:
    if x_internal_key:
        if settings.INTERNAL_SERVICE_KEY and x_internal_key == settings.INTERNAL_SERVICE_KEY:
            return SERVICE_USER
        raise HTTPException(status_code=403, detail="Invalid internal service key")

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
        if user["role"] == "service":
            return user
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


def can_see_template(template, user: dict) -> bool:
    if user["role"] == "service":
        return True
    if str(template.organization_id) != user["organization_id"]:
        return False
    if user["role"] in ("director", "admin"):
        return True
    if template.scope == "org_level":
        return True
    if template.scope == "manager_level" and str(template.created_by) == user["sub"]:
        return True
    return False
