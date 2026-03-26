from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


# --- Auth ---

class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserResponse"


class VerifyResponse(BaseModel):
    valid: bool
    payload: dict


# --- Users ---

class UserResponse(BaseModel):
    id: UUID
    email: str
    role: str
    first_name: Optional[str]
    last_name: Optional[str]
    organization_id: UUID
    store_id: Optional[UUID]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserCreateRequest(BaseModel):
    email: str
    password: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    store_id: Optional[UUID] = None


class UserUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
    store_id: Optional[UUID] = None


class ChangePasswordRequest(BaseModel):
    old_password: Optional[str] = None
    new_password: str


class RopStoresRequest(BaseModel):
    store_ids: list[UUID]


# --- Super Admin ---

class CreateOrganizationRequest(BaseModel):
    org_name: str
    org_slug: str
    director_email: str
    director_password: str
    director_first_name: str
    director_last_name: str


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


TokenResponse.model_rebuild()
