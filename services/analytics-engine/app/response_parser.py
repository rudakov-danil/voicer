import json
from typing import Optional
from pydantic import BaseModel, Field


class StepScoreSchema(BaseModel):
    step_id: str
    step_name: str
    score: float = Field(ge=0.0, le=100.0)
    detected: bool
    evidence: str = ""


class ScriptScoringResponse(BaseModel):
    step_scores: list[StepScoreSchema]
    violations: list[str] = []


class ObjectionSchema(BaseModel):
    type: str
    is_resolved: bool
    resolution_technique: Optional[str] = None
    raw_text: str


class GeneralAnalysisResponse(BaseModel):
    outcome: str = Field(pattern=r"^(purchase|deferred|price_refusal|competitor|unknown)$")
    outcome_confidence: float = Field(ge=0.0, le=1.0)
    topic: Optional[str] = None
    sentiment_avg: float = Field(ge=-1.0, le=1.0)
    objections: list[ObjectionSchema] = []


class RedactionResponse(BaseModel):
    redacted: list[str]


class UpsellCheckItem(BaseModel):
    rule_id: str
    triggered: bool
    offered_items: list[str] = []
    evidence: str = ""
    # Дословные цитаты из транскрипта — для подсветки в UI.
    trigger_quotes: list[str] = []  # где продавец/клиент упомянули trigger_product
    offer_quotes: dict[str, list[str]] = {}  # offer_name → список цитат где он реально предложен


class UpsellCheckResponse(BaseModel):
    checks: list[UpsellCheckItem] = []


class ComplianceViolationItem(BaseModel):
    rule_id: str
    evidence: str = ""
    explanation: str = ""


class ComplianceCheckResponse(BaseModel):
    violations: list[ComplianceViolationItem] = []


class LLMResponseParseError(Exception):
    pass


def parse_script_scoring_response(raw: str) -> ScriptScoringResponse:
    try:
        return ScriptScoringResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse script scoring: {e}") from e


def parse_general_analysis_response(raw: str) -> GeneralAnalysisResponse:
    try:
        return GeneralAnalysisResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse general analysis: {e}") from e


def parse_upsell_response(raw: str) -> UpsellCheckResponse:
    try:
        return UpsellCheckResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse upsell response: {e}") from e


def parse_compliance_response(raw: str) -> ComplianceCheckResponse:
    try:
        return ComplianceCheckResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse compliance response: {e}") from e


def parse_redaction_response(raw: str, expected_count: int) -> list[str]:
    try:
        parsed = RedactionResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse redaction: {e}") from e
    if len(parsed.redacted) != expected_count:
        raise LLMResponseParseError(
            f"Redaction count mismatch: expected {expected_count}, got {len(parsed.redacted)}"
        )
    return parsed.redacted
