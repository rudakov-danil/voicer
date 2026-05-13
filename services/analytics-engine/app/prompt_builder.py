import json
from openai import AsyncOpenAI
from app.config import settings

SCRIPT_SCORING_SYSTEM_PROMPT = """Ты — эксперт по продажам в розничном магазине.
Тебе дан диаризованный транскрипт разговора продавца с клиентом.

Скрипт продаж «{script_name}» содержит следующие этапы:
{script_steps}

Проанализируй, насколько продавец соблюдал этот скрипт, и верни СТРОГО валидный JSON:
{{
  "step_scores": [
    {{
      "step_id": "<UUID этапа>",
      "step_name": "<название этапа>",
      "score": <0—100>,
      "detected": <true|false>,
      "evidence": "<цитата из транскрипта или пустая строка>"
    }}
  ],
  "violations": ["<нарушение 1>", ...]
}}

Правила:
- score=0 если этап не был выполнен вообще
- detected=false если этап отсутствовал полностью
- violations — только то, что реально нарушено, не придумывай
- evidence — прямая цитата из транскрипта, не перефразируй
"""

SCREENING_SYSTEM_PROMPT = """Определи, применим ли данный скрипт продаж к данному разговору.
Описание контекста скрипта: {context_description}
Ответь СТРОГО валидным JSON: {{"applicable": true|false, "reason": "краткое обоснование"}}
Отвечай conservative: если разговор явно не про описанный контекст — applicable=false."""

REDACTION_SYSTEM_PROMPT = """Ты — система анонимизации текста для защиты персональных данных (ПД).
На вход подаётся массив реплик диалога продавца с клиентом в формате JSON.

Твоя задача — заменить ВСЕ персональные данные на токены, сохранив остальной текст реплики дословно.

Что считается ПД и какими токенами заменять (применяй к ОБЕИМ сторонам — и продавцу, и клиенту):
- Имена, фамилии, отчества людей → [ИМЯ]
- Номера телефонов (любой формат: +7..., 8..., 8 (495)... и т.п.) → [ТЕЛЕФОН]
- Email-адреса → [EMAIL]
- Почтовые адреса, улицы, дома, квартиры, города в составе адреса → [АДРЕС]
- Номера паспортов, СНИЛС, ИНН, номера карт, номера счетов → [ДОКУМЕНТ]
- Даты рождения → [ДАТА_РОЖДЕНИЯ]

Правила:
- НЕ заменяй: названия товаров, моделей, брендов, магазинов, должностей, общие слова приветствия.
- НЕ перефразируй и не сокращай оставшийся текст. Меняется ТОЛЬКО фрагмент с ПД.
- Если в реплике нет ПД — возвращай её без изменений.
- Сохраняй исходный порядок и количество элементов массива.
- Если имя упоминается несколько раз — заменяй каждое вхождение.

Верни СТРОГО валидный JSON вида:
{"redacted": ["<реплика 1 после редактуры>", "<реплика 2 после редактуры>", ...]}
"""


GENERAL_ANALYSIS_SYSTEM_PROMPT = """Ты — эксперт по продажам в розничном магазине.
Проанализируй разговор и верни СТРОГО валидный JSON:
{{
  "outcome": "<purchase|deferred|price_refusal|competitor|unknown>",
  "outcome_confidence": <0.0—1.0>,
  "topic": "<название товара или null>",
  "sentiment_avg": <-1.0 до 1.0>,
  "objections": [
    {{
      "type": "<price|quality|competitors|timing|trust|not_ready|functionality>",
      "is_resolved": <true|false>,
      "resolution_technique": "<техника или null>",
      "raw_text": "<фраза клиента>"
    }}
  ]
}}
"""


MAX_SEGMENTS_FOR_LLM = 80


def _format_transcript(segments: list[dict], max_segments: int = MAX_SEGMENTS_FOR_LLM) -> str:
    # Limit segments to avoid huge prompts on slow CPU-based LLMs
    if len(segments) > max_segments:
        step = len(segments) / max_segments
        segments = [segments[int(i * step)] for i in range(max_segments)]
    lines = []
    for seg in segments:
        role = "ПРОДАВЕЦ" if seg.get("speaker_role") == "seller" else "КЛИЕНТ"
        time_s = seg.get("start_ms", 0) // 1000
        lines.append(f"{role} [{time_s}с]: {seg.get('text', '')}")
    return "Транскрипт разговора:\n" + "\n".join(lines)


def _format_step(step: dict) -> str:
    base = f"- ID={step['id']} | {step['name']} (вес {step['weight']}): {step.get('description', '')}"
    examples = step.get("example_phrases") or []
    if examples:
        ex_text = "; ".join(f'«{e}»' for e in examples if e)
        if ex_text:
            base += f"\n    Образцы формулировок: {ex_text}"
    return base


def build_script_prompt(transcript_segments: list[dict], script: dict) -> tuple[str, str]:
    steps_text = "\n".join(
        _format_step(step)
        for step in sorted(script["steps"], key=lambda s: s["step_order"])
    )
    system = SCRIPT_SCORING_SYSTEM_PROMPT.format(
        script_name=script["name"],
        script_steps=steps_text,
    )
    user = _format_transcript(transcript_segments)
    return system, user


def build_general_prompt(transcript_segments: list[dict]) -> tuple[str, str]:
    return GENERAL_ANALYSIS_SYSTEM_PROMPT, _format_transcript(transcript_segments)


def build_redaction_prompt(texts: list[str]) -> tuple[str, str]:
    user = json.dumps({"texts": texts}, ensure_ascii=False)
    return REDACTION_SYSTEM_PROMPT, user


UPSELL_CHECK_SYSTEM_PROMPT = """Ты — аудитор работы продавца.
На вход дан транскрипт разговора + список правил апсейла, которые продавец должен соблюдать
(если речь шла о соответствующем продукте — он обязан был предложить эти дополнения).

Для КАЖДОГО правила определи:
- triggered: продавец обсуждал основной продукт правила (true/false). Если false — правило не релевантно этому разговору.
- offered_items: какие из required_offers продавец РЕАЛЬНО предложил клиенту (массив строк, точно как в required_offers).
- evidence: одна короткая цитата из транскрипта (фраза продавца), либо пустая строка.

Верни СТРОГО валидный JSON:
{
  "checks": [
    {
      "rule_id": "<UUID правила>",
      "triggered": <true|false>,
      "offered_items": ["<offer 1>", ...],
      "evidence": "<цитата или ''>"
    }
  ]
}

Правила:
- Не выдумывай — если предложения не было, offered_items=[].
- triggered=true только если продавец и клиент действительно обсуждали этот продукт.
- evidence — дословная цитата ИЗ ТРАНСКРИПТА, не перефразировать."""


def build_upsell_prompt(transcript_segments: list[dict], rules: list[dict]) -> tuple[str, str]:
    rules_text = "\n".join(
        f"- ID={r['id']} | продукт: {r['trigger_product']} | required_offers: {r['required_offers']}"
        for r in rules
    )
    transcript = _format_transcript(transcript_segments)
    user = f"Правила апсейла:\n{rules_text}\n\n{transcript}"
    return UPSELL_CHECK_SYSTEM_PROMPT, user


async def screen_contextual_script(
    transcript_segments: list[dict],
    script: dict,
    llm_client: AsyncOpenAI,
) -> tuple[bool, str]:
    if not script.get("context_description"):
        return True, "no context filter"

    system = SCREENING_SYSTEM_PROMPT.format(context_description=script["context_description"])
    user = _format_transcript(transcript_segments)
    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.0,
            max_tokens=200,
            response_format={"type": "json_object"},
            timeout=30,
        )
        data = json.loads(response.choices[0].message.content)
        return bool(data.get("applicable", False)), data.get("reason", "")
    except Exception as e:
        return False, f"LLM_PARSE_ERROR: {e}"
