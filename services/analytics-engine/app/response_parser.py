import re
import json
from typing import Optional
from pydantic import BaseModel, Field, field_validator


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
RETAIL_OUTCOMES = {"purchase", "deferred", "price_refusal", "competitor", "no_purchase", "unknown"}
#: Исходы телефонии: продажа/заявка, запись на встречу, договорились о перезвоне,
#: думает, отказ, перевод на другого, нецелевой/спам, автоответчик
TELEPHONY_OUTCOMES = {
    "purchase", "appointment", "callback", "deferred", "refusal",
    "transfer", "non_target", "voicemail", "resolved", "unknown",
}
ALL_OUTCOMES = RETAIL_OUTCOMES | TELEPHONY_OUTCOMES


#: Категории обращения (для решения, оценивать ли звонок в рейтинге менеджера):
#: sales — продажный диалог (есть намерение/потенциал сделки),
#: service — обслуживание существующего клиента (статус заказа, поддержка),
#: non_target — нецелевой (ошиблись номером, спам, не наш профиль, вакансии),
#: other — прочее / не удалось определить.
CALL_CATEGORIES = {"sales", "service", "non_target", "other"}


class GeneralAnalysisResponse(BaseModel):
    # ВАЖНО: не жёсткая regex-валидация, а мягкая коэрция. Раньше pattern ронял ВЕСЬ
    # объект, если LLM возвращала исход вне списка (частый случай на сервисных звонках,
    # где «продажный» исход не подходит и модель выдумывает свой) — и вместе с ним
    # терялся call_category, из-за чего сервисный звонок ошибочно уходил в скоринг.
    outcome: str = "unknown"
    outcome_confidence: float = Field(ge=0.0, le=1.0)
    topic: Optional[str] = None
    sentiment_avg: float = Field(ge=-1.0, le=1.0)
    objections: list[ObjectionSchema] = []
    # Категория обращения — заполняется только для звонков (телефония). Для розницы
    # остаётся None (в промпте не запрашивается). Невалидное значение → None (см. валидатор).
    call_category: Optional[str] = None
    # Краткая причина обращения клиента (тегирование причин звонков), свободный текст.
    contact_reason: Optional[str] = None

    @field_validator("outcome", mode="before")
    @classmethod
    def _valid_outcome(cls, v) -> str:
        # Неизвестный/некорректный исход не рушит анализ — схлопываем в 'unknown'.
        return v if isinstance(v, str) and v in ALL_OUTCOMES else "unknown"

    @field_validator("call_category")
    @classmethod
    def _valid_category(cls, v: Optional[str]) -> Optional[str]:
        return v if v in CALL_CATEGORIES else None


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


OFFER_CATEGORIES = {"size", "addon", "food", "drink", "loyalty", "promo", "other"}
OFFER_KINDS = {"upsell", "cross_sell"}
OFFER_TECHNIQUES = {"generic", "specific", "choice", "benefit", "promo"}
OFFER_RESPONSES = {"accepted", "declined", "no_answer"}
DEMAND_CATEGORIES = {"rx", "otc", "supplement", "medical", "cosmetics", "baby", "other"}
DEMAND_REASONS = {"out_of_stock", "not_carried"}
DEMAND_OUTCOMES = {"substituted", "ordered", "lost", "unknown"}


def _coerce(value, allowed: set[str], default: str) -> str:
    v = (value or "").strip().lower() if isinstance(value, str) else ""
    return v if v in allowed else default


def _money(v) -> Optional[float]:
    # «420», «420 ₽», «3 900 тенге», 420.0 → число; мусор, ноль и отрицательные → None
    if isinstance(v, str):
        digits = "".join(ch for ch in v.replace(",", ".") if ch.isdigit() or ch == ".")
        v = digits or None
    try:
        f = float(v) if v is not None else None
    except (TypeError, ValueError):
        return None
    return f if f is not None and 0 < f < 10_000_000 else None


class OfferItem(BaseModel):
    """Одно предложение продавца. Значения вне справочника не роняют разбор —
    сводятся к безопасному дефолту."""
    item: str
    category: str = "other"
    kind: str = "cross_sell"
    technique: str = "specific"
    response: str = "no_answer"
    is_focus: bool = False
    quote: str = ""
    customer_quote: str = ""
    # Цена предложенного (для большего объёма — доплата), если прозвучала
    amount: Optional[float] = None

    @field_validator("amount", mode="before")
    @classmethod
    def _amount(cls, v) -> Optional[float]:
        return _money(v)

    @field_validator("item", mode="before")
    @classmethod
    def _item(cls, v) -> str:
        return (str(v) if v is not None else "").strip()[:255]

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v) -> str:
        return _coerce(v, OFFER_CATEGORIES, "other")

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, v) -> str:
        return _coerce(v, OFFER_KINDS, "cross_sell")

    @field_validator("technique", mode="before")
    @classmethod
    def _technique(cls, v) -> str:
        return _coerce(v, OFFER_TECHNIQUES, "specific")

    @field_validator("response", mode="before")
    @classmethod
    def _response(cls, v) -> str:
        return _coerce(v, OFFER_RESPONSES, "no_answer")

    @field_validator("is_focus", mode="before")
    @classmethod
    def _focus(cls, v) -> bool:
        return v is True or (isinstance(v, str) and v.strip().lower() == "true")

    @field_validator("quote", "customer_quote", mode="before")
    @classmethod
    def _text(cls, v) -> str:
        return v.strip() if isinstance(v, str) else ""


def demand_key(item: str) -> str:
    """Ключ группировки просьб: «Нурофен  Экспресс, 200мг» и «нурофен экспресс 200 мг» — одна позиция."""
    s = (item or "").casefold().replace("ё", "е")
    s = re.sub(r"(\d)\s*(мг|мл|г|шт|таб)\b", r"\1 \2", s)
    s = re.sub(r"[^\w%]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()[:255]


class DemandItem(BaseModel):
    """Неудовлетворённый спрос: покупатель спросил товар, а его нет в наличии или в ассортименте."""
    item: str
    category: str = "other"
    reason: str = "out_of_stock"
    outcome: str = "unknown"
    analog: Optional[str] = None
    quote: str = ""
    seller_quote: str = ""

    @field_validator("item", mode="before")
    @classmethod
    def _item(cls, v) -> str:
        return (str(v) if v is not None else "").strip()[:255]

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v) -> str:
        return _coerce(v, DEMAND_CATEGORIES, "other")

    @field_validator("reason", mode="before")
    @classmethod
    def _reason(cls, v) -> str:
        return _coerce(v, DEMAND_REASONS, "out_of_stock")

    @field_validator("outcome", mode="before")
    @classmethod
    def _outcome(cls, v) -> str:
        return _coerce(v, DEMAND_OUTCOMES, "unknown")

    @field_validator("analog", mode="before")
    @classmethod
    def _analog(cls, v) -> Optional[str]:
        if not isinstance(v, str):
            return None
        v = v.strip()[:255]
        return v if v and v.lower() not in ("null", "none", "нет", "-") else None

    @field_validator("quote", "seller_quote", mode="before")
    @classmethod
    def _text(cls, v) -> str:
        return v.strip() if isinstance(v, str) else ""

    @property
    def key(self) -> str:
        return demand_key(self.item)


class OffersResponse(BaseModel):
    order_taken: bool = True
    order_items: list[str] = []
    check_total: Optional[float] = None
    offers: list[OfferItem] = []
    missed: Optional[str] = None
    better_phrase: Optional[str] = None
    # Что покупатель просил, а этого не оказалось: есть и в разговорах без покупки
    unmet_demand: list[DemandItem] = []

    @field_validator("order_items", mode="before")
    @classmethod
    def _items(cls, v) -> list[str]:
        if not isinstance(v, list):
            return []
        return [str(x).strip()[:120] for x in v if isinstance(x, (str, int, float)) and str(x).strip()][:30]

    @field_validator("check_total", mode="before")
    @classmethod
    def _check(cls, v) -> Optional[float]:
        # «420», «420 ₽», 420.0 → 420; мусор и отрицательные → None
        if isinstance(v, str):
            digits = "".join(ch for ch in v.replace(",", ".") if ch.isdigit() or ch == ".")
            v = digits or None
        try:
            f = float(v) if v is not None else None
        except (TypeError, ValueError):
            return None
        return f if f is not None and 0 < f < 10_000_000 else None

    @field_validator("offers", mode="before")
    @classmethod
    def _offers(cls, v) -> list:
        # Битые элементы (не объект, без item) отбрасываем, а не роняем весь разбор
        if not isinstance(v, list):
            return []
        return [o for o in v if isinstance(o, dict) and str(o.get("item") or "").strip()]

    @field_validator("missed", "better_phrase", mode="before")
    @classmethod
    def _opt_text(cls, v) -> Optional[str]:
        if not isinstance(v, str):
            return None
        v = v.strip()
        return v if v and v.lower() not in ("null", "none", "нет", "-") else None

    @field_validator("unmet_demand", mode="before")
    @classmethod
    def _demand(cls, v) -> list:
        if not isinstance(v, list):
            return []
        return [d for d in v if isinstance(d, dict) and str(d.get("item") or "").strip()][:10]


class TipItem(BaseModel):
    title: str = ""
    text: str = ""
    phrase: str = ""
    # Отчёт руководителю: дословная цитата сотрудника из разговора как доказательство
    quote: str = ""


class TipsResponse(BaseModel):
    praise: Optional[str] = None
    focus: Optional[str] = None
    tips: list[TipItem] = []

    @field_validator("tips", mode="before")
    @classmethod
    def _tips(cls, v) -> list:
        if not isinstance(v, list):
            return []
        return [t for t in v if isinstance(t, dict) and (t.get("title") or t.get("text"))][:3]


class ComplianceViolationItem(BaseModel):
    rule_id: str
    evidence: str = ""
    explanation: str = ""


class ComplianceCheckResponse(BaseModel):
    violations: list[ComplianceViolationItem] = []


class LLMResponseParseError(Exception):
    pass


def parse_script_scoring_response(raw: str, expected_steps: list[dict] | None = None) -> ScriptScoringResponse:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise LLMResponseParseError(f"Failed to parse script scoring: {e}") from e
    _normalize_script_scoring(data)
    try:
        parsed = ScriptScoringResponse(**data)
        if expected_steps:
            _match_script_steps(parsed, expected_steps)
        return parsed
    except (TypeError, ValueError) as e:
        raise LLMResponseParseError(f"Failed to parse script scoring: {e}") from e


def _match_script_steps(parsed: ScriptScoringResponse, expected_steps: list[dict]) -> None:
    """Repair an invented ID only when the step name uniquely matches the template.

    Preserve valid IDs and their scores. Never match by list order or fuzzy text;
    ambiguity must not silently award credit to a different step.
    """
    valid_ids = {str(step["id"]) for step in expected_steps}
    used_ids = {score.step_id for score in parsed.step_scores if score.step_id in valid_ids}
    by_name: dict[str, list[str]] = {}
    for step in expected_steps:
        key = " ".join(step["name"].casefold().split())
        by_name.setdefault(key, []).append(str(step["id"]))
    candidates: dict[str, list[StepScoreSchema]] = {}
    for score in parsed.step_scores:
        if score.step_id in valid_ids:
            continue
        matches = by_name.get(" ".join(score.step_name.casefold().split()), [])
        if len(matches) == 1 and matches[0] not in used_ids:
            candidates.setdefault(matches[0], []).append(score)
    for step_id, scores in candidates.items():
        if len(scores) == 1:
            scores[0].step_id = step_id


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


def parse_offers_response(raw: str) -> OffersResponse:
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("offers response is not an object")
        parsed = OffersResponse(**data)
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        raise LLMResponseParseError(f"Failed to parse offers response: {e}") from e
    if not parsed.order_taken:
        # Без заказа нет и возможности допродать: что бы LLM ни вернула в offers, это шум
        parsed.offers = []
        parsed.missed = None
        parsed.better_phrase = None
    parsed.offers = _merge_repeated_offers(parsed.offers)
    # Спрос не зависит от того, купил ли покупатель что-то: «Нурофена нет» — и ушёл, это главный случай
    parsed.unmet_demand = _merge_repeated_demand(parsed.unmet_demand)
    return parsed


def _merge_repeated_demand(items: list[DemandItem]) -> list[DemandItem]:
    """Один товар, спрошенный дважды в разговоре, — одна просьба; исход — самый определённый."""
    rank = {"unknown": 0, "lost": 1, "ordered": 2, "substituted": 3}
    merged: dict[str, DemandItem] = {}
    for d in items:
        if not d.key:
            continue
        first = merged.get(d.key)
        if first is None:
            merged[d.key] = d
            continue
        if rank[d.outcome] > rank[first.outcome]:
            first.outcome = d.outcome
            first.analog = d.analog or first.analog
    return list(merged.values())


def _merge_repeated_offers(offers: list[OfferItem]) -> list[OfferItem]:
    """Повтор того же товара в разговоре — одно предложение, а не два: иначе уговоры
    после отказа раздувают счётчик. Итог по реакции — самый поздний явный ответ клиента."""
    merged: dict[str, OfferItem] = {}
    for offer in offers:
        key = offer.item.casefold()
        first = merged.get(key)
        if first is None:
            merged[key] = offer
            continue
        if offer.response != "no_answer":
            first.response = offer.response
            first.customer_quote = offer.customer_quote or first.customer_quote
        first.is_focus = first.is_focus or offer.is_focus
    return list(merged.values())


def parse_tips_response(raw: str) -> TipsResponse:
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("tips response is not an object")
        return TipsResponse(**data)
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        raise LLMResponseParseError(f"Failed to parse tips response: {e}") from e


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
