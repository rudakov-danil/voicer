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
