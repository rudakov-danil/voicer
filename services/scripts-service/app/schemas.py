import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class ScriptStepCreate(BaseModel):
    name: str
    description: Optional[str] = None
    weight: float
    is_required: bool = True
    step_order: int
    recommendation_text: Optional[str] = None
    example_phrases: list[str] = []


class ScriptStepOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    weight: float
    is_required: bool
    step_order: int
    recommendation_text: Optional[str]
    example_phrases: list[str] = []

    model_config = {"from_attributes": True}


class TemplateCreate(BaseModel):
    name: str
    short_name: Optional[str] = None
    description: Optional[str] = None
    scope: str = "org_level"
    context_description: Optional[str] = None
    steps: list[ScriptStepCreate]


class TemplatePatch(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    applies_to_all_stores: Optional[bool] = None


class TemplateListItem(BaseModel):
    id: uuid.UUID
    name: str
    short_name: Optional[str] = None
    description: Optional[str]
    scope: str
    is_active: bool
    step_count: int
    seller_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignedSeller(BaseModel):
    seller_id: uuid.UUID
    is_mandatory: bool


class AssignedStore(BaseModel):
    store_id: uuid.UUID
    is_mandatory: bool


class TemplateDetail(BaseModel):
    id: uuid.UUID
    name: str
    short_name: Optional[str] = None
    description: Optional[str]
    scope: str
    context_description: Optional[str]
    is_active: bool
    applies_to_all_stores: bool = False
    steps: list[ScriptStepOut]
    assigned_sellers: list[AssignedSeller]
    assigned_stores: list[AssignedStore] = []

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    seller_id: uuid.UUID
    template_id: uuid.UUID
    is_mandatory: bool = False


class AssignmentOut(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID
    template_id: uuid.UUID
    template_name: str
    scope: str
    is_mandatory: bool
    assigned_at: datetime

    model_config = {"from_attributes": True}


class AssignmentListItem(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID
    template_id: uuid.UUID
    template_name: str
    scope: str
    is_mandatory: bool
    assigned_at: datetime

    model_config = {"from_attributes": True}


class ForSellerScriptOut(BaseModel):
    id: uuid.UUID
    name: str
    is_mandatory: bool
    context_description: Optional[str]
    steps: list[ScriptStepOut]

    model_config = {"from_attributes": True}


class ForSellerResponse(BaseModel):
    seller_id: uuid.UUID
    scripts: list[ForSellerScriptOut]


# --- Store assignments ---

class StoreAssignmentCreate(BaseModel):
    store_id: uuid.UUID
    template_id: uuid.UUID
    is_mandatory: bool = False


class StoreAssignmentOut(BaseModel):
    id: uuid.UUID
    store_id: uuid.UUID
    template_id: uuid.UUID
    template_name: str
    scope: str
    is_mandatory: bool
    assigned_at: datetime

    model_config = {"from_attributes": True}


# --- Versions ---

class VersionItem(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    version_number: int
    note: Optional[str]
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionDetail(VersionItem):
    snapshot: dict


# --- Upsell rules ---

class UpsellRuleCreate(BaseModel):
    store_id: Optional[uuid.UUID] = None
    trigger_product: str
    required_offers: list[str]
    is_active: bool = True


class UpsellRulePatch(BaseModel):
    store_id: Optional[uuid.UUID] = None
    trigger_product: Optional[str] = None
    required_offers: Optional[list[str]] = None
    is_active: Optional[bool] = None


class UpsellRuleOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    store_id: Optional[uuid.UUID]
    trigger_product: str
    required_offers: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Cross-sell rules (симметрично Upsell) ---

class CrossSellRuleCreate(BaseModel):
    store_id: Optional[uuid.UUID] = None
    trigger_product: str
    required_offers: list[str]
    is_active: bool = True


class CrossSellRulePatch(BaseModel):
    store_id: Optional[uuid.UUID] = None
    trigger_product: Optional[str] = None
    required_offers: Optional[list[str]] = None
    is_active: Optional[bool] = None


class CrossSellRuleOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    store_id: Optional[uuid.UUID]
    trigger_product: str
    required_offers: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
