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


class ScriptStepOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    weight: float
    is_required: bool
    step_order: int
    recommendation_text: Optional[str]

    model_config = {"from_attributes": True}


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scope: str = "org_level"
    context_description: Optional[str] = None
    steps: list[ScriptStepCreate]


class TemplatePatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TemplateListItem(BaseModel):
    id: uuid.UUID
    name: str
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


class TemplateDetail(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    scope: str
    context_description: Optional[str]
    is_active: bool
    steps: list[ScriptStepOut]
    assigned_sellers: list[AssignedSeller]

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
