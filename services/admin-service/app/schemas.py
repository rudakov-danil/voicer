from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# --- Stores ---

class StoreResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    address: Optional[str]
    is_active: bool
    seller_count: int = 0
    device_count: int = 0

    class Config:
        from_attributes = True


class StoreCreateRequest(BaseModel):
    name: str
    address: Optional[str] = None


class StoreUpdateRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class StoreListResponse(BaseModel):
    items: list[StoreResponse]
    total: int


# --- Sellers ---

class SellerResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: UUID
    store_name: Optional[str] = None
    first_name: str
    last_name: str
    is_active: bool

    class Config:
        from_attributes = True


class SellerCreateRequest(BaseModel):
    store_id: UUID
    first_name: str
    last_name: str


class SellerUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None


class SellerListResponse(BaseModel):
    items: list[SellerResponse]
    total: int


# --- Devices ---

class SellerShort(BaseModel):
    id: UUID
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class DeviceResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: UUID
    seller_id: Optional[UUID]
    serial_number: str
    model: Optional[str]
    is_active: bool
    last_seen_at: Optional[datetime]

    class Config:
        from_attributes = True


class DeviceWithSellerResponse(DeviceResponse):
    seller: Optional[SellerShort] = None


class DeviceCreateRequest(BaseModel):
    store_id: UUID
    seller_id: Optional[UUID] = None
    serial_number: str
    model: Optional[str] = None


class DeviceUpdateRequest(BaseModel):
    seller_id: Optional[UUID] = None
    store_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class DeviceListResponse(BaseModel):
    items: list[DeviceResponse]
    total: int


# --- Settings ---

class PrivacySettingsResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: Optional[UUID]
    retention_days: int
    anonymize_transcripts: bool
    consent_required: bool

    class Config:
        from_attributes = True


class PrivacySettingsUpdateRequest(BaseModel):
    store_id: Optional[UUID] = None
    retention_days: int = 90
    anonymize_transcripts: bool = False
    consent_required: bool = True


class AlertSettingsResponse(BaseModel):
    id: UUID
    organization_id: UUID
    store_id: Optional[UUID]
    score_threshold: int
    no_activity_hours: Optional[int]
    email_recipients: Optional[list[str]]
    is_active: bool

    class Config:
        from_attributes = True


class AlertSettingsUpdateRequest(BaseModel):
    store_id: Optional[UUID] = None
    score_threshold: int = 60
    no_activity_hours: Optional[int] = 4
    email_recipients: Optional[list[str]] = None
    is_active: bool = True
