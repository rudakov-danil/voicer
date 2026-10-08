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
      "evidence": "<ДОСЛОВНАЯ цитата из транскрипта — копируй буква в букву, или пустая строка>"
    }}
  ],
  "violations": ["<нарушение 1>", ...]
}}

Правила:
- score=0 если этап не был выполнен вообще
- detected=false если этап отсутствовал полностью
- violations — только то, что реально нарушено, не придумывай
- evidence: одна КОНКРЕТНАЯ короткая фраза-цитата из реплики продавца (НЕ перефразировать, НЕ объединять разные реплики через "..."). Если есть несколько подходящих — выбери одну самую яркую. Если этап не выполнен — пустая строка.
"""

FULLTEXT_SCRIPT_SYSTEM_PROMPT = """Ты — аудитор соблюдения скрипта разговора.
Скрипт «{script_name}» задан как последовательность блоков — фраз и смысловых секций,
которые сотрудник (в транскрипте — ПРОДАВЕЦ) должен проговорить клиенту.

Блоки скрипта:
{script_blocks}

Для КАЖДОГО блока определи по транскрипту:
- "spoken" — сотрудник произнёс блок близко к тексту (допустимы мелкие отличия и искажения транскрибации)
- "paraphrased" — донёс смысл блока своими словами
- "missed" — блок ТРЕБОВАЛСЯ в этом разговоре, но сотрудник его не проговорил (реальный пропуск)
- "not_applicable" — ситуация для блока НЕ возникла, поэтому он закономерно не нужен
  (например, блок «ответ на возражение по цене», а клиент про цену вообще не заговаривал)

КАК различать "missed" и "not_applicable" для ситуативных блоков (ответы на возражения,
реакции на «если клиент скажет…»):
- если соответствующая ситуация/возражение В РАЗГОВОРЕ ВОЗНИКЛИ, но сотрудник их не отработал → "missed";
- если ситуация в разговоре не возникала (клиент об этом не говорил) → "not_applicable".
Обязательные блоки (приветствие, представление, выявление потребности и т.п.) нужны ВСЕГДА —
для них "not_applicable" не используй: если не прозвучал, это "missed".

Верни СТРОГО валидный JSON:
{{
  "blocks": [
    {{
      "block_id": "<UUID блока>",
      "status": "<spoken|paraphrased|missed|not_applicable>",
      "quote": "<ДОСЛОВНАЯ цитата реплики продавца из транскрипта, подтверждающая блок, или пустая строка>",
      "comment": "<краткий комментарий: что упущено / почему ситуация не возникла, или пустая строка>"
    }}
  ]
}}

Правила:
- В ответе должен быть КАЖДЫЙ блок из списка, ровно один раз.
- quote — ОДНА короткая фраза (до ~120 символов) из реплики продавца, дословно (включая
  искажения STT), НЕ вся реплика и НЕ перефразируй. Для missed/not_applicable — пустая строка.
- comment — очень кратко (до ~80 символов) или пустая строка.
- Не засчитывай блок как spoken/paraphrased, если его произнёс клиент, а не продавец.
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
      "raw_text": "<ДОСЛОВНАЯ фраза клиента из транскрипта — копируй буква в букву, без перефразирования>"
    }}
  ]
}}

Как выбирать outcome (строго в этом порядке приоритета):
- purchase — если клиент покупает ХОТЯ БЫ ОДИН товар/услугу здесь и сейчас. Триггеры:
  фразы клиента «давайте беру / возьму / оформляйте», оформление чека, выписка карты лояльности,
  благодарность за покупку. Если по части позиций клиент сказал «возьму», а по другим
  «подумаю» — всё равно outcome=purchase (был факт продажи).
- deferred — клиент НИЧЕГО не купил сейчас, но обещал вернуться, попросил отложить,
  взял расчёт/контакты домой подумать. Полностью отложенная покупка.
- price_refusal — клиент НИЧЕГО не купил И прямой повод — цена («дорого», «не по карману»,
  «нет таких денег»), даже после попыток продавца снизить чек/предложить альтернативу.
- competitor — клиент НИЧЕГО не купил И прямо сказал, что пойдёт/уже видел у конкурентов
  лучше/дешевле/выгоднее.
- unknown — разговор оборвался, неясен исход, или это вообще не диалог о продаже.

Не путай частичное закрытие с «отложено»: если продавец оформил чек хотя бы на один товар —
это purchase, даже если по другим позициям клиент ушёл думать.
"""


GENERAL_ANALYSIS_TELEPHONY_SYSTEM_PROMPT = """Ты — эксперт по продажам и обслуживанию по телефону.
Тебе дан транскрипт телефонного звонка ({direction_label}) между оператором/менеджером
(в транскрипте — ПРОДАВЕЦ) и клиентом.
Проанализируй звонок и верни СТРОГО валидный JSON:
{{
  "outcome": "<purchase|appointment|callback|deferred|refusal|transfer|non_target|voicemail|resolved|unknown>",
  "outcome_confidence": <0.0—1.0>,
  "topic": "<тема звонка: товар/услуга/причина обращения, или null>",
  "call_category": "<sales|service|non_target|other>",
  "contact_reason": "<краткая причина обращения клиента, 3-7 слов, или null>",
  "sentiment_avg": <-1.0 до 1.0>,
  "objections": [
    {{
      "type": "<price|quality|competitors|timing|trust|not_ready|functionality>",
      "is_resolved": <true|false>,
      "resolution_technique": "<техника или null>",
      "raw_text": "<ДОСЛОВНАЯ фраза клиента из транскрипта — копируй буква в букву, без перефразирования>"
    }}
  ]
}}

Как выбирать call_category (определяет, оценивать ли работу менеджера в этом звонке):
- sales — продажный диалог: клиент интересуется покупкой/услугой, подбором, ценой,
  условиями; есть намерение или потенциал сделки. Оценивается по скрипту продаж.
- service — обслуживание текущего клиента: статус заказа, поддержка, жалоба, доставка,
  возврат — без новой продажи.
- non_target — нецелевой звонок: ошиблись номером, спам/реклама, поставщик, соискатель
  вакансии, не наш профиль.
- other — не удалось однозначно отнести к продажам/сервису.
Ставь sales ТОЛЬКО при реальном намерении/потенциале покупки — иначе service/non_target.

Как выбирать outcome (строго в этом порядке приоритета):
- purchase — клиент оформил заказ/заявку/покупку прямо в звонке («оформляйте», «беру»,
  продиктовал данные для заказа, согласился на договор).
- appointment — назначена конкретная встреча, запись, замер, показ, визит (есть дата/время
  или договорённость о них).
- callback — договорились о повторном звонке/менеджер перезвонит с расчётом.
- deferred — клиент взял паузу подумать, без конкретной договорённости о следующем шаге.
- refusal — клиент явно отказался (по любой причине: цена, передумал, выбрал другое).
- transfer — звонок переведён на другого сотрудника/отдел, разговор по сути не состоялся.
- non_target — нецелевой звонок: ошиблись номером, спам, не клиент (поставщик, реклама).
- voicemail — автоответчик, недозвон, тишина, обрыв в самом начале.
- resolved — сервисный звонок: клиент получил ответ/консультацию, вопрос решён,
  продажа не требовалась (обычно вместе с call_category=service).
- unknown — исход не удалось определить.
Если был и заказ, и договорённость о встрече — приоритет purchase.

Возражения — это ЛЮБОЕ сомнение или отговорка клиента, даже мимоходом, в том числе:
- «у меня уже есть карта/услуга/договор другого банка (компании)» → type=competitors
- «в чём подвох», «наверняка скрытые комиссии», «не верю» → type=trust
- «дорого», «не потяну» → type=price; «не нужно», «не пользуюсь» → type=not_ready
Если оператор ответил на возражение и клиент продолжил разговор позитивно — is_resolved=true."""


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


# Хардкод-перечисление типов в промптах — заменяется на коды из справочника организации.
# Должно ДОСЛОВНО совпадать со строкой в GENERAL_*_SYSTEM_PROMPT и _MERGED_GENERAL_SECTION_*.
OBJECTION_ENUM_PLACEHOLDER = "price|quality|competitors|timing|trust|not_ready|functionality"


def apply_objection_types(
    system: str, user: str, objection_types: list[dict] | None
) -> tuple[str, str]:
    """Подставляет настраиваемые типы возражений организации в промпт общего анализа.

    1) В system: перечисление кодов в JSON-схеме заменяется на коды справочника.
    2) В user: перед транскриптом добавляется расшифровка типов (название, описание,
       примеры фраз) — примеры учат LLM отраслевой специфике.
    Пустой/отсутствующий справочник → промпт остаётся со стандартными 7 типами.
    """
    types = [t for t in (objection_types or []) if t.get("code")]
    if not types:
        return system, user
    system = system.replace(OBJECTION_ENUM_PLACEHOLDER, "|".join(t["code"] for t in types))
    lines = []
    for t in types:
        line = f"- {t['code']} — {t.get('label', '')}"
        if t.get("description"):
            line += f": {t['description']}"
        examples = [e for e in (t.get("example_phrases") or []) if e]
        if examples:
            line += "\n    Примеры фраз клиента: " + "; ".join(f"«{e}»" for e in examples)
        lines.append(line)
    user = "Типы возражений (в поле type используй только эти коды):\n" + "\n".join(lines) + "\n\n" + user
    return system, user


def _direction_label(call_context: dict | None) -> str:
    direction = (call_context or {}).get("call_direction")
    return {"inbound": "входящий", "outbound": "исходящий"}.get(direction, "направление неизвестно")


def is_call_context(call_context: dict | None) -> bool:
    """True, если запись — телефонный звонок (телефонийный набор исходов).

    Звонком считается запись с source=call_* ЛИБО любая запись с указанным
    направлением (например, транскрипт звонка, загруженный вручную для тестов).
    """
    if not call_context:
        return False
    if (call_context.get("source") or "").startswith("call"):
        return True
    return bool(call_context.get("call_direction"))


SUMMARY_SYSTEM_PROMPT = """Ты — ассистент, который делает краткое деловое резюме {conversation_kind} между {seller_role} и клиентом.

Проанализируй транскрипт и верни резюме на русском языке в формате Markdown, строго по этой структуре:

**Кратко:** одно-два предложения — о чём был разговор и чем закончился.

**Запрос клиента:** с чем обратился клиент, что хотел.

**Ход разговора:** 3–6 маркеров (списком через «- ») ключевых моментов: что предложил {seller_role_short}, какие вопросы задавал клиент, возражения и как их отработали.

**Договорённости и следующий шаг:** к чему пришли, что обещали, кто и что должен сделать дальше. Если явных договорённостей нет — так и напиши.

Правила:
- Опирайся ТОЛЬКО на факты из транскрипта, ничего не выдумывай.
- Не оценивай работу {seller_role_short} и не выставляй баллов — это делает отдельный модуль. Только факты.
- Пиши сжато и по делу, без воды. Без вступлений вроде «Вот резюме»."""


def build_summary_prompt(
    transcript_segments: list[dict],
    call_context: dict | None = None,
) -> tuple[str, str]:
    """Промпт для генерации краткого резюме диалога (для карточки разговора)."""
    is_call = is_call_context(call_context)
    system = SUMMARY_SYSTEM_PROMPT.format(
        conversation_kind=(f"телефонного разговора ({_direction_label(call_context)} звонок)" if is_call else "разговора в торговом зале"),
        seller_role=("оператором" if is_call else "продавцом"),
        seller_role_short=("оператор" if is_call else "продавец"),
    )
    return system, _format_transcript(transcript_segments)


def build_fulltext_script_prompt(transcript_segments: list[dict], script: dict) -> tuple[str, str]:
    """Промпт оценки покрытия полнотекстового скрипта (script_type=fulltext)."""
    blocks_text = "\n".join(
        f"- ID={b['id']} | [{'обязательный' if b.get('is_mandatory', True) else 'ситуативный'}] "
        f"{b.get('title') or 'Блок ' + str(b.get('block_order', ''))}:\n"
        f"    «{b['text']}»"
        for b in sorted(script.get("blocks", []), key=lambda b: b.get("block_order", 0))
    )
    system = FULLTEXT_SCRIPT_SYSTEM_PROMPT.format(
        script_name=script["name"],
        script_blocks=blocks_text,
    )
    return system, _format_transcript(transcript_segments)


def build_general_prompt(
    transcript_segments: list[dict],
    call_context: dict | None = None,
    objection_types: list[dict] | None = None,
) -> tuple[str, str]:
    if is_call_context(call_context):
        system = GENERAL_ANALYSIS_TELEPHONY_SYSTEM_PROMPT.format(
            direction_label=_direction_label(call_context)
        )
    else:
        system = GENERAL_ANALYSIS_SYSTEM_PROMPT
    user = _format_transcript(transcript_segments)
    return apply_objection_types(system, user, objection_types)


def build_redaction_prompt(texts: list[str]) -> tuple[str, str]:
    user = json.dumps({"texts": texts}, ensure_ascii=False)
    return REDACTION_SYSTEM_PROMPT, user


SELL_CHECK_SYSTEM_PROMPT = """Ты — аудитор работы продавца.
На вход дан транскрипт разговора + список правил {sell_type_genitive} (продавец обязан был
предложить эти дополнения, если речь шла о соответствующем продукте).

Триггеры и офферы могут быть записаны транскрибатором с искажениями (опечатки, неправильное
склонение, кириллица вместо латиницы и наоборот). Учитывай это и распознавай по смыслу:
например, «иксь-лайн», «X-line», «икс лайн» — это одно и то же.

Для КАЖДОГО правила определи:
- triggered: продавец/клиент действительно обсуждали основной продукт правила (true/false).
- offered_items: какие из required_offers продавец РЕАЛЬНО предложил клиенту (массив строк
  ТОЧНО как в required_offers — копируй название из правила без изменений).
- evidence: одна короткая цитата из транскрипта (фраза продавца).
- trigger_quotes: массив дословных коротких цитат из транскрипта, где упоминается основной
  продукт правила. По одной короткой цитате на каждое явное упоминание (но не более 5).
  Цитата = непрерывный фрагмент реплики (одно предложение или его часть), КОПИРУЙ дословно.
- offer_quotes: объект {{"<название оффера ТОЧНО как в required_offers>": ["<цитата 1>", ...]}}.
  Включай ТОЛЬКО те офферы, что есть в offered_items. Каждой цитатой подтверждай, что продавец
  реально это предложил. По 1-3 коротких цитаты на оффер.

Верни СТРОГО валидный JSON:
{{
  "checks": [
    {{
      "rule_id": "<UUID правила>",
      "triggered": <true|false>,
      "offered_items": ["<offer 1>", ...],
      "evidence": "<цитата или ''>",
      "trigger_quotes": ["<цитата 1>", ...],
      "offer_quotes": {{"<offer 1>": ["<цитата>", ...], ...}}
    }}
  ]
}}

Правила:
- Не выдумывай — если предложения не было, offered_items=[], offer_quotes={{}}.
- triggered=true только если продавец/клиент действительно обсуждали этот продукт.
- Цитаты ДОСЛОВНЫЕ из транскрипта (включая искажения транскрибации) — копируй буква в букву.
  НЕ перефразируй и НЕ "исправляй" — нам нужны цитаты для подсветки точного места в тексте."""


# Совместимость со старым именем, чтобы не ломать импорты в analyze_worker
UPSELL_CHECK_SYSTEM_PROMPT = SELL_CHECK_SYSTEM_PROMPT


def build_upsell_prompt(transcript_segments: list[dict], rules: list[dict]) -> tuple[str, str]:
    rules_text = "\n".join(
        f"- ID={r['id']} | продукт: {r['trigger_product']} | required_offers: {r['required_offers']}"
        for r in rules
    )
    transcript = _format_transcript(transcript_segments)
    user = f"Правила апсейла:\n{rules_text}\n\n{transcript}"
    return SELL_CHECK_SYSTEM_PROMPT.format(sell_type_genitive="апсейла"), user


COMPLIANCE_CHECK_SYSTEM_PROMPT = """Ты — аудитор соблюдения правил коммуникации продавца.
На вход дан транскрипт разговора + список правил коммуникации, которые продавец обязан соблюдать
(общие правила поведения: без ругательств, не конфликтовать с клиентом, не давать ложных обещаний и т.п.).

Для КАЖДОГО факта нарушения (если оно есть) определи:
- rule_id: UUID правила, которое нарушено.
- evidence: ДОСЛОВНАЯ короткая цитата реплики продавца, которая является нарушением. Копируй буква в букву,
  без перефразирования. Только реплика продавца, не клиента.
- explanation: краткое (1 предложение) объяснение, почему это считается нарушением именно этого правила.

Верни СТРОГО валидный JSON:
{
  "violations": [
    {
      "rule_id": "<UUID>",
      "evidence": "<дословная цитата продавца>",
      "explanation": "<краткое объяснение>"
    }
  ]
}

Правила:
- Если нарушений нет — верни {"violations": []}. Не выдумывай нарушения.
- Несколько нарушений одного правила = несколько записей с одинаковым rule_id и разными evidence.
- Оценивай только то, что в правилах. Не добавляй замечаний по скриптам продаж, апсейлу и т.п. — это
  другие проверки.
- Цитата ДОСЛОВНАЯ — никаких "..." и склейки реплик. Если конкретной цитаты нет (нарушение поведения в
  целом, например, общая агрессия), evidence можно оставить пустым."""


# ──────────────────────────────────────────────────────────────────────────
# Объединённый проход: общий анализ + комплаенс одним вызовом LLM.
# Транскрипт пересылается один раз вместо двух. Правила обеих секций должны
# СОВПАДАТЬ по смыслу с GENERAL_ANALYSIS_SYSTEM_PROMPT и COMPLIANCE_CHECK_SYSTEM_PROMPT —
# при их изменении обновляй и здесь. Корректность подстрахована фолбэком в воркере.
# Собирается из частей: заголовок + секция general (розница или телефония) + секция compliance.
# Без .format() — в строках много литеральных фигурных скобок (JSON-схемы).
_MERGED_HEADER_RETAIL = """Ты — эксперт по продажам и аудитор коммуникации в розничном магазине.
Тебе дан транскрипт разговора продавца с клиентом и список правил коммуникации.
Выполни ДВА НЕЗАВИСИМЫХ анализа и верни СТРОГО валидный JSON ровно с двумя ключами верхнего уровня: "general" и "compliance".
"""

_MERGED_HEADER_TELEPHONY = """Ты — эксперт по телефонным продажам и аудитор коммуникации.
Тебе дан транскрипт телефонного звонка ({direction_label}) между оператором/менеджером (в транскрипте — ПРОДАВЕЦ) и клиентом, и список правил коммуникации.
Выполни ДВА НЕЗАВИСИМЫХ анализа и верни СТРОГО валидный JSON ровно с двумя ключами верхнего уровня: "general" и "compliance".
"""

_MERGED_GENERAL_SECTION_RETAIL = """
═══ Секция "general" — анализ итога разговора ═══
Формат:
{
  "outcome": "<purchase|deferred|price_refusal|competitor|unknown>",
  "outcome_confidence": <0.0—1.0>,
  "topic": "<название товара или null>",
  "sentiment_avg": <-1.0 до 1.0>,
  "objections": [
    {
      "type": "<price|quality|competitors|timing|trust|not_ready|functionality>",
      "is_resolved": <true|false>,
      "resolution_technique": "<техника или null>",
      "raw_text": "<ДОСЛОВНАЯ фраза клиента из транскрипта — копируй буква в букву, без перефразирования>"
    }
  ]
}
Как выбирать outcome (строго в этом порядке приоритета):
- purchase — если клиент покупает ХОТЯ БЫ ОДИН товар/услугу здесь и сейчас. Триггеры:
  фразы клиента «давайте беру / возьму / оформляйте», оформление чека, выписка карты лояльности,
  благодарность за покупку. Если по части позиций клиент сказал «возьму», а по другим
  «подумаю» — всё равно outcome=purchase (был факт продажи).
- deferred — клиент НИЧЕГО не купил сейчас, но обещал вернуться, попросил отложить,
  взял расчёт/контакты домой подумать. Полностью отложенная покупка.
- price_refusal — клиент НИЧЕГО не купил И прямой повод — цена («дорого», «не по карману»,
  «нет таких денег»), даже после попыток продавца снизить чек/предложить альтернативу.
- competitor — клиент НИЧЕГО не купил И прямо сказал, что пойдёт/уже видел у конкурентов
  лучше/дешевле/выгоднее.
- unknown — разговор оборвался, неясен исход, или это вообще не диалог о продаже.
Не путай частичное закрытие с «отложено»: если продавец оформил чек хотя бы на один товар —
это purchase, даже если по другим позициям клиент ушёл думать.
"""

_MERGED_GENERAL_SECTION_TELEPHONY = """
═══ Секция "general" — анализ итога звонка ═══
Формат:
{
  "outcome": "<purchase|appointment|callback|deferred|refusal|transfer|non_target|voicemail|resolved|unknown>",
  "outcome_confidence": <0.0—1.0>,
  "topic": "<тема звонка: товар/услуга/причина обращения, или null>",
  "call_category": "<sales|service|non_target|other>",
  "contact_reason": "<краткая причина обращения клиента, 3-7 слов, или null>",
  "sentiment_avg": <-1.0 до 1.0>,
  "objections": [
    {
      "type": "<price|quality|competitors|timing|trust|not_ready|functionality>",
      "is_resolved": <true|false>,
      "resolution_technique": "<техника или null>",
      "raw_text": "<ДОСЛОВНАЯ фраза клиента из транскрипта — копируй буква в букву, без перефразирования>"
    }
  ]
}
Как выбирать call_category (определяет, оценивать ли работу менеджера в этом звонке):
- sales — продажный диалог: интерес к покупке/услуге, подбор, цена, условия; есть
  намерение или потенциал сделки. Оценивается по скрипту продаж.
- service — обслуживание текущего клиента (статус заказа, поддержка, жалоба) без новой продажи.
- non_target — нецелевой: ошиблись номером, спам/реклама, поставщик, соискатель вакансии.
- other — не удалось однозначно отнести к продажам/сервису.
Ставь sales ТОЛЬКО при реальном намерении/потенциале покупки — иначе service/non_target.
Как выбирать outcome (строго в этом порядке приоритета):
- purchase — клиент оформил заказ/заявку/покупку прямо в звонке («оформляйте», «беру»,
  продиктовал данные для заказа, согласился на договор).
- appointment — назначена конкретная встреча, запись, замер, показ, визит (есть дата/время
  или договорённость о них).
- callback — договорились о повторном звонке/менеджер перезвонит с расчётом.
- deferred — клиент взял паузу подумать, без конкретной договорённости о следующем шаге.
- refusal — клиент явно отказался (по любой причине: цена, передумал, выбрал другое).
- transfer — звонок переведён на другого сотрудника/отдел, разговор по сути не состоялся.
- non_target — нецелевой звонок: ошиблись номером, спам, не клиент (поставщик, реклама).
- voicemail — автоответчик, недозвон, тишина, обрыв в самом начале.
- resolved — сервисный звонок: клиент получил ответ/консультацию, вопрос решён,
  продажа не требовалась (обычно вместе с call_category=service).
- unknown — исход не удалось определить.
Если был и заказ, и договорённость о встрече — приоритет purchase.
Возражения — это ЛЮБОЕ сомнение или отговорка клиента, даже мимоходом, в том числе:
- «у меня уже есть карта/услуга/договор другого банка (компании)» → type=competitors
- «в чём подвох», «наверняка скрытые комиссии», «не верю» → type=trust
- «дорого», «не потяну» → type=price; «не нужно», «не пользуюсь» → type=not_ready
Если оператор ответил на возражение и клиент продолжил разговор позитивно — is_resolved=true.
"""

_MERGED_COMPLIANCE_SECTION = """
═══ Секция "compliance" — аудит правил коммуникации ═══
Список правил коммуникации дан во входных данных (продавец обязан их соблюдать: без ругательств,
не конфликтовать с клиентом, не давать ложных обещаний и т.п.).
Для КАЖДОГО факта нарушения (если оно есть) определи:
- rule_id: UUID правила, которое нарушено.
- evidence: ДОСЛОВНАЯ короткая цитата реплики продавца, которая является нарушением. Копируй буква
  в букву, без перефразирования. Только реплика продавца, не клиента.
- explanation: краткое (1 предложение) объяснение, почему это нарушение именно этого правила.
Формат:
{
  "violations": [
    { "rule_id": "<UUID>", "evidence": "<дословная цитата продавца>", "explanation": "<краткое объяснение>" }
  ]
}
Правила комплаенса:
- Если нарушений нет — верни "violations": []. Не выдумывай нарушения.
- Несколько нарушений одного правила = несколько записей с одинаковым rule_id и разными evidence.
- Оценивай только то, что в правилах коммуникации. Не добавляй замечаний по скриптам продаж/апсейлу.
- Цитата ДОСЛОВНАЯ — никаких "..." и склейки реплик. Если конкретной цитаты нет (общая агрессия),
  evidence можно оставить пустым.

═══ Итоговый формат ответа (ровно эта структура) ═══
{
  "general": { ...поля секции general... },
  "compliance": { "violations": [ ...нарушения... ] }
}"""


def build_general_compliance_prompt(
    transcript_segments: list[dict],
    compliance_rules: list[dict],
    call_context: dict | None = None,
    objection_types: list[dict] | None = None,
) -> tuple[str, str]:
    """Объединённый промпт: общий анализ + комплаенс. Транскрипт + правила — один раз."""
    if is_call_context(call_context):
        header = _MERGED_HEADER_TELEPHONY.format(direction_label=_direction_label(call_context))
        general_section = _MERGED_GENERAL_SECTION_TELEPHONY
    else:
        header = _MERGED_HEADER_RETAIL
        general_section = _MERGED_GENERAL_SECTION_RETAIL
    system = header + general_section + _MERGED_COMPLIANCE_SECTION

    rules_text = "\n".join(
        f"- ID={r['id']} | важность={r.get('severity', 'medium')} | {r['title']}"
        + (f"\n    Описание: {r['description']}" if r.get('description') else "")
        for r in compliance_rules
    )
    transcript = _format_transcript(transcript_segments)
    user = f"Правила коммуникации:\n{rules_text}\n\n{transcript}"
    return apply_objection_types(system, user, objection_types)


def build_compliance_prompt(transcript_segments: list[dict], rules: list[dict]) -> tuple[str, str]:
    rules_text = "\n".join(
        f"- ID={r['id']} | важность={r.get('severity', 'medium')} | {r['title']}"
        + (f"\n    Описание: {r['description']}" if r.get('description') else "")
        for r in rules
    )
    transcript = _format_transcript(transcript_segments)
    user = f"Правила коммуникации:\n{rules_text}\n\n{transcript}"
    return COMPLIANCE_CHECK_SYSTEM_PROMPT, user


def build_crosssell_prompt(transcript_segments: list[dict], rules: list[dict]) -> tuple[str, str]:
    rules_text = "\n".join(
        f"- ID={r['id']} | продукт: {r['trigger_product']} | required_offers: {r['required_offers']}"
        for r in rules
    )
    transcript = _format_transcript(transcript_segments)
    user = f"Правила кросс-сейла:\n{rules_text}\n\n{transcript}"
    return SELL_CHECK_SYSTEM_PROMPT.format(sell_type_genitive="кросс-сейла"), user


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
            model=settings.LLM_CHEAP_MODEL or settings.LLM_MODEL_NAME,
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
