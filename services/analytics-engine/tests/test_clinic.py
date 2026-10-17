import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.clinic import (
    LLMParseError, PROTOCOL_KEYS, analyze_visit, build_quality_prompt, format_visit_transcript,
    parse_protocol_response, parse_quality_response, visit_scores,
)


def rule(category, kind, title, severity="medium"):
    return {"id": str(uuid4()), "code": None, "category": category, "kind": kind, "title": title,
            "description": f"Описание: {title}", "severity": severity}


RULES = [
    rule("service", "required", "Поздоровался"),
    rule("service", "required", "Объяснил лечение"),
    rule("competence", "required", "Уточнил аллергии"),
    rule("competence", "required", "Провёл осмотр"),
    rule("service", "forbidden", "Грубость", "high"),
    rule("fraud", "forbidden", "Увод пациента", "high"),
]
GREET, PLAN, ALLERGY, EXAM, RUDE, DIVERSION = RULES

SEGMENTS = [
    {"speaker_role": "seller", "text": "Здравствуйте, я терапевт Айгуль Маратовна.", "start_ms": 0},
    {"speaker_role": "customer", "text": "Горло болит третий день.", "start_ms": 4000},
    {"speaker_role": "seller", "text": "Приходите лучше ко мне в частный кабинет, там дешевле.", "start_ms": 65000},
]


def quality_json(checks, violations=(), note="Главное"):
    return json.dumps({"checks": list(checks), "violations": list(violations), "note": note}, ensure_ascii=False)


def test_transcript_keeps_every_turn_with_doctor_and_patient_labels():
    many = [{"speaker_role": "customer", "text": f"реплика {i}", "start_ms": i * 1000} for i in range(300)]
    text = format_visit_transcript(SEGMENTS + many)
    assert "ВРАЧ [00:00]: Здравствуйте" in text and "ПАЦИЕНТ [00:04]" in text and "ВРАЧ [01:05]" in text
    assert "реплика 299" in text  # без прореживания, как в розничных промптах


def test_quality_prompt_lists_rules_by_kind():
    _, user = build_quality_prompt(SEGMENTS, RULES, "Терапевт")
    required, forbidden = user.split("Правила «не должно быть»:")
    assert GREET["id"] in required and ALLERGY["id"] in required and DIVERSION["id"] not in required
    assert DIVERSION["id"] in forbidden and "Фрод | Увод пациента" in forbidden
    assert "Специальность врача: Терапевт" in user


def test_scores_count_partial_as_half_and_skip_not_applicable():
    parsed = parse_quality_response(quality_json([
        {"rule_id": GREET["id"], "status": "met", "quote": "Здравствуйте"},
        {"rule_id": PLAN["id"], "status": "partial", "quote": "Пейте ибупрофен", "comment": "Без схемы"},
        {"rule_id": ALLERGY["id"], "status": "na"},
        {"rule_id": EXAM["id"], "status": "missed", "quote": "должна исчезнуть"},
    ]), RULES)
    scores = visit_scores(parsed)
    assert scores["service_score"] == 75.0
    assert scores["competence_score"] == 0.0  # аллергии «не применимо» в балл не входят
    assert parsed["checks"][3]["quote"] == ""  # цитата бывает только у выполненного


def test_forbidden_rules_become_signals_by_category():
    parsed = parse_quality_response(quality_json(
        [{"rule_id": r["id"], "status": "met"} for r in RULES if r["kind"] == "required"],
        [{"rule_id": DIVERSION["id"], "quote": "Приходите лучше ко мне в частный кабинет", "explanation": "Зовёт к себе"},
         {"rule_id": RUDE["id"], "quote": "Не выдумывайте", "explanation": "Обесценивает"},
         {"rule_id": GREET["id"], "quote": "required rule as violation is ignored"}],
    ), RULES)
    scores = visit_scores(parsed)
    assert scores["fraud_signals"] == 1 and scores["issue_signals"] == 1
    assert scores["service_score"] == 100.0  # запреты в балл не входят — считаются отдельно


def test_unknown_ids_duplicates_and_bad_statuses_do_not_break_the_check():
    parsed = parse_quality_response(quality_json([
        {"rule_id": "not-a-rule", "status": "met"},
        {"rule_id": GREET["id"], "status": "выполнено"},
        {"rule_id": GREET["id"], "status": "met"},
        {"status": "met"},
    ], [{"rule_id": str(uuid4()), "quote": "x"}]), RULES)
    by_title = {c["rule"]["title"]: c for c in parsed["checks"]}
    assert by_title["Поздоровался"]["status"] == "na"  # первая запись правила, статус не из списка
    # Правило, которое модель пропустила, не штрафует врача
    assert by_title["Провёл осмотр"]["status"] == "na" and "не оценила" in by_title["Провёл осмотр"]["comment"]
    assert len(parsed["checks"]) == 4 and parsed["violations"] == []


def test_quality_without_checks_list_is_a_parse_error():
    with pytest.raises(LLMParseError):
        parse_quality_response('{"checks": "нет"}', RULES)
    with pytest.raises(LLMParseError):
        parse_quality_response("не json", RULES)


def test_protocol_keeps_only_known_sections_and_drops_empty_values():
    parsed = parse_protocol_response(json.dumps({
        "is_visit": True, "reason": "Боль в горле", "visit_type": "повторный",
        "protocol": {"complaints": "Боль в горле 3 дня", "diagnosis": "ОРВИ", "icd10": "J06.9",
                     "treatment": ["Ибупрофен 400 мг 3 раза в день 3 дня", "Полоскание горла"],
                     "allergies": "не обсуждалось", "tests": "", "secret": "ignore me"},
    }, ensure_ascii=False))
    p = parsed["protocol"]
    assert set(p) == set(PROTOCOL_KEYS)
    assert p["treatment"] == "— Ибупрофен 400 мг 3 раза в день 3 дня\n— Полоскание горла"
    assert p["allergies"] is None and p["tests"] is None and p["sick_leave"] is None
    assert parsed["visit_type"] is None and parsed["is_visit"] is True


def test_protocol_without_visit_flag_is_treated_as_a_visit():
    assert parse_protocol_response('{"protocol": {}}')["is_visit"] is True
    assert parse_protocol_response('{"is_visit": false, "protocol": {}}')["is_visit"] is False
    with pytest.raises(LLMParseError):
        parse_protocol_response('{"is_visit": true}')


def _llm(*answers):
    llm = MagicMock()
    responses = []
    for a in answers:
        r = MagicMock()
        r.choices[0].message.content = a
        responses.append(r)
    llm.chat.completions.create = AsyncMock(side_effect=responses)
    return llm


@pytest.mark.asyncio
async def test_analysis_retries_a_broken_answer_once(monkeypatch):
    monkeypatch.setattr("app.clinic.asyncio.sleep", AsyncMock())
    protocol = json.dumps({"is_visit": True, "reason": "Горло", "protocol": {"complaints": "Боль в горле"}}, ensure_ascii=False)
    quality = quality_json([{"rule_id": GREET["id"], "status": "met", "quote": "Здравствуйте"}])
    # Порядок вызовов в gather не гарантирован: отвечаем по системному промпту
    answers = {"protocol": iter(["{}", protocol]), "quality": iter([quality])}

    async def create(**kwargs):
        kind = "protocol" if "черновик протокола" in kwargs["messages"][0]["content"] else "quality"
        r = MagicMock()
        r.choices[0].message.content = next(answers[kind])
        return r

    llm = MagicMock()
    llm.chat.completions.create = create
    result = await analyze_visit(SEGMENTS, RULES, llm)
    assert result["protocol"]["protocol"]["complaints"] == "Боль в горле"
    assert result["quality"]["checks"][0]["status"] == "met"


@pytest.mark.asyncio
async def test_analysis_gives_up_after_two_failures(monkeypatch):
    monkeypatch.setattr("app.clinic.asyncio.sleep", AsyncMock())
    llm = _llm("{}", "{}")
    result = await analyze_visit(SEGMENTS, [], llm)
    assert result == {"protocol": None, "quality": None}
    assert llm.chat.completions.create.await_count == 2  # без правил проверки качества нет


@pytest.mark.asyncio
async def test_clinic_recording_uses_visit_analysis_before_sales(monkeypatch):
    from worker import analyze_worker as worker

    payload = {key: str(uuid4()) for key in (
        "recording_id", "transcript_id", "seller_id", "store_id", "organization_id",
    )}
    message = MagicMock()
    message.body = json.dumps(payload).encode()
    message.process.return_value.__aenter__ = AsyncMock()
    message.process.return_value.__aexit__ = AsyncMock(return_value=False)
    db = AsyncMock()
    result = MagicMock()
    result.mappings.return_value.first.return_value = None
    db.execute.return_value = result
    monkeypatch.setattr(worker, "_fetch_transcript", AsyncMock(return_value=SEGMENTS))
    monkeypatch.setattr(worker, "_fetch_call_context", AsyncMock(return_value={"source": "mobile"}))
    monkeypatch.setattr(worker, "_fetch_org_industry", AsyncMock(return_value="clinic"))
    visit = AsyncMock()
    scripts = AsyncMock()
    context = AsyncMock()
    monkeypatch.setattr(worker, "_process_clinic_visit", visit)
    monkeypatch.setattr(worker, "_fetch_scripts", scripts)
    monkeypatch.setattr(worker, "classify_context", context)

    await worker.process_analyze_message(message, db, MagicMock())

    visit.assert_awaited_once()
    assert visit.call_args.args[2] == payload["recording_id"]
    scripts.assert_not_awaited()
    context.assert_not_awaited()
