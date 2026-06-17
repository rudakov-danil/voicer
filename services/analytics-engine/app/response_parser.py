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


#: Исходы офлайн-розницы (бейджи)
RETAIL_OUTCOMES = {"purchase", "deferred", "price_refusal", "competitor", "unknown"}
#: Исходы телефонии: продажа/заявка, запись на встречу, договорились о перезвоне,
#: думает, отказ, перевод на другого, нецелевой/спам, автоответчик
TELEPHONY_OUTCOMES = {
    "purchase", "appointment", "callback", "deferred", "refusal",
    "transfer", "non_target", "voicemail", "unknown",
}
ALL_OUTCOMES = RETAIL_OUTCOMES | TELEPHONY_OUTCOMES


class GeneralAnalysisResponse(BaseModel):
    outcome: str = Field(pattern=r"^(purchase|appointment|callback|deferred|refusal|transfer|non_target|voicemail|price_refusal|competitor|unknown)$")
    outcome_confidence: float = Field(ge=0.0, le=1.0)
    topic: Optional[str] = None
    sentiment_avg: float = Field(ge=-1.0, le=1.0)
    objections: list[ObjectionSchema] = []


class BlockResultSchema(BaseModel):
    """Оценка одного блока полнотекстового скрипта.

    not_applicable — ситуация для блока не возникла (клиент не возразил/тема не
    поднималась); такой блок исключается из балла, а не считается провалом.
    """
    block_id: str
    status: str = Field(pattern=r"^(spoken|paraphrased|missed|not_applicable)$")
    quote: str = ""
    comment: str = ""


class FulltextScoringResponse(BaseModel):
    blocks: list[BlockResultSchema] = []


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
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMResponseParseError(f"Failed to parse script scoring: {e}") from e
    _normalize_script_scoring(data)
    try:
        return ScriptScoringResponse(**data)
    except (TypeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse script scoring: {e}") from e


def _normalize_script_scoring(data: object) -> None:
    """Чинит частые структурные огрехи LLM на месте.

    Некоторые модели (напр. qwen) кладут `violations` лишним элементом ВНУТРЬ
    массива `step_scores`, вместо соседнего ключа. Вытаскиваем такие элементы
    в top-level `violations`, а не-степы из step_scores отбрасываем, чтобы один
    структурный сбой не обнулял весь скоринг.
    """
    if not isinstance(data, dict):
        return
    steps = data.get("step_scores")
    if not isinstance(steps, list):
        return
    clean_steps: list = []
    extra_violations: list[str] = []
    for item in steps:
        if not isinstance(item, dict):
            continue
        if "step_id" not in item and "violations" in item:
            v = item.get("violations")
            if isinstance(v, list):
                extra_violations.extend(str(x) for x in v)
            continue
        clean_steps.append(item)
    data["step_scores"] = clean_steps
    if extra_violations:
        existing = data.get("violations")
        data["violations"] = (existing if isinstance(existing, list) else []) + extra_violations


def parse_general_analysis_response(raw: str) -> GeneralAnalysisResponse:
    try:
        return GeneralAnalysisResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse general analysis: {e}") from e


def parse_fulltext_scoring_response(raw: str) -> FulltextScoringResponse:
    try:
        return FulltextScoringResponse(**json.loads(raw))
    except (json.JSONDecodeError, ValueError):
        # Ответ часто обрывается по лимиту токенов (длинный JSON на много блоков).
        # Спасаем все блоки, которые успели прийти целыми, вместо обнуления скрипта.
        salvaged = _salvage_block_objects(raw)
        if salvaged:
            return FulltextScoringResponse(blocks=salvaged)
        raise LLMResponseParseError("Failed to parse fulltext scoring (no salvageable blocks)")


def _salvage_block_objects(raw: str) -> list[BlockResultSchema]:
    """Достаёт из (возможно оборванного) JSON все целые объекты-блоки.

    Идём по строке, выделяя сбалансированные {...} с учётом строк/экранирования,
    парсим каждый и оставляем валидные по схеме. Незавершённый последний объект
    (обрыв по токенам) просто отбрасывается.
    """
    blocks: list[BlockResultSchema] = []
    stack: list[int] = []  # позиции открывающих { — извлекаем каждую сбалансированную пару
    in_str = False
    escape = False
    for i, ch in enumerate(raw):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            stack.append(i)
        elif ch == "}" and stack:
            start = stack.pop()
            fragment = raw[start:i + 1]
            try:
                obj = json.loads(fragment)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict) and "block_id" in obj and "status" in obj:
                try:
                    blocks.append(BlockResultSchema(**obj))
                except ValueError:
                    continue
    return blocks


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
