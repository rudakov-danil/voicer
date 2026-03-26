from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.security import decode_token

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Not an access token")

    result = await db.execute(
        text("SELECT is_active FROM auth.users WHERE id = :id AND organization_id = :org"),
        {"id": payload["sub"], "org": payload["organization_id"]},
    )
    row = result.fetchone()
    if not row or not row.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return payload


def require_role(*roles: str):
    async def _check(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return _check


async def get_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("type") != "super_access":
        raise HTTPException(status_code=403, detail="Super admin access required")

    result = await db.execute(
        text("SELECT is_active FROM auth.super_admins WHERE id = :id"),
        {"id": payload["sub"]},
    )
    row = result.fetchone()
    if not row or not row.is_active:
        raise HTTPException(status_code=401, detail="Super admin not found or deactivated")

    return payload
