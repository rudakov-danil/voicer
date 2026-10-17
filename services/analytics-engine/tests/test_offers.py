"""Разбор допродаж: парсер ответа LLM, счётчики разговора и промпты (без БД и LLM)."""
import json

import pytest

from app.prompt_builder import build_general_prompt, build_offers_prompt, build_tips_prompt
from app.response_parser import LLMResponseParseError, parse_offers_response, parse_tips_response
from worker.analyze_worker import _offer_counters

SEGMENTS = [
    {"speaker_role": "seller", "text": "Добрый день! Что вам приготовить?", "start_ms": 0},
    {"speaker_role": "customer", "text": "Капучино, пожалуйста.", "start_ms": 2000},
]


def _raw(**over):
    data = {
        "order_taken": True,
        "order_items": ["капучино", "круассан"],
        "check_total": "330 ₽",
        "offers": [
            {"item": "круассан", "category": "food", "kind": "cross_sell", "technique": "benefit",
             "response": "accepted", "is_focus": False, "quote": "К кофе круассан возьмёте?", "customer_quote": "Давайте"},
            {"item": "что-нибудь ещё", "category": "other", "kind": "cross_sell", "technique": "generic",
             "response": "declined", "quote": "Что-нибудь ещё?", "customer_quote": "Нет"},
        ],
        "missed": None,
        "better_phrase": "null",
    }
    data.update(over)
    return json.dumps(data, ensure_ascii=False)


def test_parse_offers_coerces_values():
    parsed = parse_offers_response(_raw())
    assert parsed.check_total == 330.0
    assert parsed.better_phrase is None
    assert [o.technique for o in parsed.offers] == ["benefit", "generic"]


def test_unknown_enum_values_fall_back_to_defaults():
    parsed = parse_offers_response(_raw(offers=[
        {"item": "сироп", "category": "syrup", "kind": "add", "technique": "magic", "response": "maybe"},
        {"category": "food"},  # без item — отбрасывается
        "мусор",
    ]))
    assert len(parsed.offers) == 1
    o = parsed.offers[0]
    assert (o.category, o.kind, o.technique, o.response) == ("other", "cross_sell", "specific", "no_answer")


def test_no_order_means_no_offers():
    parsed = parse_offers_response(_raw(order_taken=False, missed="Можно было предложить десерт"))
    assert parsed.offers == [] and parsed.missed is None and parsed.better_phrase is None


def test_repeated_offer_is_merged_with_latest_answer():
    parsed = parse_offers_response(_raw(offers=[
        {"item": "Маффин", "technique": "promo", "response": "declined", "customer_quote": "Нет"},
        {"item": "маффин", "technique": "benefit", "response": "accepted", "customer_quote": "Ладно, давайте"},
    ]))
    assert len(parsed.offers) == 1
    assert parsed.offers[0].technique == "promo"
    assert parsed.offers[0].response == "accepted"
    assert parsed.offers[0].customer_quote == "Ладно, давайте"


def test_invalid_json_raises():
    with pytest.raises(LLMResponseParseError):
        parse_offers_response("not json")
    with pytest.raises(LLMResponseParseError):
        parse_offers_response("[]")


def test_counters_skip_generic_question():
    counters = _offer_counters(parse_offers_response(_raw()))
    assert counters["offer_opportunity"] is True
    assert counters["offers_count"] == 1  # «Что-нибудь ещё?» попыткой не считается
    assert counters["offers_accepted"] == 1
    assert counters["check_total"] == 330.0


def test_counters_skip_accepted_generic_question():
    counters = _offer_counters(parse_offers_response(_raw(offers=[
        {"item": "что-нибудь ещё", "category": "other", "kind": "cross_sell", "technique": "generic",
         "response": "accepted", "quote": "Что-нибудь ещё?", "customer_quote": "Да, круассан"},
    ])))
    assert counters["offers_count"] == 0
    assert counters["offers_accepted"] == 0  # иначе «согласились» больше, чем «предлагали»


def test_counters_absent_when_analysis_failed():
    assert _offer_counters(None) == {}


def test_offers_prompt_includes_hints_and_focus():
    rules = [{"trigger_product": "Капучино", "required_offers": ["Сироп", "Больший объём"]}]
    system, user = build_offers_prompt(SEGMENTS, "coffee", rules, [], ["Тыквенный раф"])
    assert "кофейне" in system
    assert "к «Капучино»: Сироп, Больший объём" in user
    assert "Товар дня (сеть продвигает сейчас): Тыквенный раф" in user
    assert "ПРОДАВЕЦ [0с]" in user


def test_general_prompt_gets_industry_preamble_only_for_retail():
    _, user = build_general_prompt(SEGMENTS, None, None, "coffee")
    assert user.startswith("Контекст: сетевая кофейня")
    _, user_call = build_general_prompt(SEGMENTS, {"source": "call_manual"}, None, "coffee")
    assert "кофейня" not in user_call
    _, user_plain = build_general_prompt(SEGMENTS, None, None, None)
    assert user_plain.startswith("Транскрипт разговора")


def test_tips_parsing_and_prompt():
    parsed = parse_tips_response(json.dumps({
        "praise": "Хорошо", "focus": "Предлагайте десерт",
        "tips": [{"title": "a", "text": "b", "phrase": "c"}, {"x": 1}, {"title": "d"}, {"title": "e"}, {"title": "f"}],
    }))
    assert len(parsed.tips) == 3
    system, user = build_tips_prompt({"заказов": 3}, [], "coffee", ["Раф"])
    assert "кофейне" in system and "товар_дня" in user


def test_unmet_demand_kept_when_nothing_was_bought():
    # «Нурофена нет» — и покупатель ушёл: заказа не было, но спрос нужен для закупки
    parsed = parse_offers_response(_raw(order_taken=False, unmet_demand=[
        {"item": "Нурофен Экспресс 200 мг", "category": "otc", "reason": "out_of_stock", "outcome": "lost",
         "analog": "null", "quote": "Нурофен экспресс есть?", "seller_quote": "Закончился, к сожалению"},
    ]))
    assert parsed.offers == []
    assert len(parsed.unmet_demand) == 1
    d = parsed.unmet_demand[0]
    assert (d.category, d.reason, d.outcome, d.analog) == ("otc", "out_of_stock", "lost", None)
    assert d.key == "нурофен экспресс 200 мг"


def test_demand_key_groups_spelling_variants():
    from app.response_parser import demand_key
    assert demand_key("Нурофен  Экспресс, 200мг") == demand_key("нурофен экспресс 200 мг")
    assert demand_key("Ксарелто 20мг №28") == "ксарелто 20 мг 28"


def test_repeated_demand_is_one_request_with_the_clearest_outcome():
    parsed = parse_offers_response(_raw(unmet_demand=[
        {"item": "Терафлю", "outcome": "unknown", "quote": "Терафлю есть?"},
        {"item": "терафлю", "outcome": "substituted", "analog": "Фервекс", "quote": "А Терафлю точно нет?"},
        {"item": "", "outcome": "lost"},
        "мусор",
    ]))
    assert len(parsed.unmet_demand) == 1
    assert parsed.unmet_demand[0].outcome == "substituted" and parsed.unmet_demand[0].analog == "Фервекс"


def test_unknown_demand_values_fall_back_to_defaults():
    parsed = parse_offers_response(_raw(unmet_demand=[{"item": "Пенталгин", "category": "pills", "reason": "gone", "outcome": "maybe"}]))
    d = parsed.unmet_demand[0]
    assert (d.category, d.reason, d.outcome) == ("other", "out_of_stock", "unknown")


def test_offers_prompt_for_pharmacy_asks_for_unmet_demand():
    system, user = build_offers_prompt(SEGMENTS, "pharmacy", [], [], [])
    assert "аптеке" in system and "unmet_demand" in system
    assert user.startswith("Контекст: аптечная сеть")


def test_offer_amount_is_parsed_from_spoken_price():
    parsed = parse_offers_response(_raw(offers=[
        {"item": "Витамин D3", "technique": "benefit", "response": "accepted", "amount": "3 400 тенге"},
        {"item": "карта лояльности", "category": "loyalty", "technique": "specific", "response": "accepted", "amount": "null"},
    ]))
    assert [o.amount for o in parsed.offers] == [3400.0, None]


def test_manager_report_is_about_the_employee_not_for_them():
    system, user = build_tips_prompt({"покупок": 11}, [], "pharmacy", [], audience="manager", seller_name="Асель")
    assert "Асель" in system and "РУКОВОДИТЕЛЬ" in system
    assert "покупатель" in system and "фармацевт" in system
    assert "Фраза руководителя" not in system and "phrase" not in system
    assert "медицинских рекомендаций" in system
