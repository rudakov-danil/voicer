import json
import logging
import re

from app.config import settings

logger = logging.getLogger(__name__)

# Диаризация/сегментация — механическая классификация, «размышление» reasoning-моделей
# (qwen3.6 тратит сотни токенов ДО видимого ответа и при малом max_tokens отдаёт пустой
# контент → роли не определяются). Отключаем reasoning через reasoning_effort="none".
# Если провайдер не знает этот параметр (не-Yandex) — один раз ловим 400 и дальше шлём без него.
_REASONING_PARAM_SUPPORTED = True


async def _create_no_reasoning(llm_client, **kwargs):
    """LLM-вызов с отключённым reasoning и провайдеро-устойчивым фолбэком."""
    global _REASONING_PARAM_SUPPORTED
    if _REASONING_PARAM_SUPPORTED:
        try:
            return await llm_client.chat.completions.create(
                extra_body={"reasoning_effort": "none"}, **kwargs
            )
        except Exception as e:
            if "reasoning_effort" in str(e):
                _REASONING_PARAM_SUPPORTED = False
                logger.warning("Provider rejected reasoning_effort; retrying without it")
            else:
                raise
    return await llm_client.chat.completions.create(**kwargs)

DIARIZATION_SYSTEM_PROMPT = """Ты — экспертная система диаризации деловых разговоров.
Тебе дан ПОЛНЫЙ транскрипт одного разговора между РАБОТНИКОМ (S) — продавцом, консультантом, оператором, менеджером — и КЛИЕНТОМ (C).
Имя работника: {seller_name}

ВНИМАНИЕ: транскрипт получен из системы распознавания речи, она часто НЕ ставит знаки вопроса.
Фраза без "?" в конце может всё равно быть вопросом — определяй по СОДЕРЖАНИЮ, а не по пунктуации.

ЯВНЫЕ ТЕКСТОВЫЕ МАРКЕРЫ РАБОТНИКА (S):

1) Местоимения "мы / у нас / наш" в значении компания:
   "У нас в наличии и тот и другой", "В нашем салоне", "Наша компания", "У нас сейчас акция",
   "Можем предложить", "Давайте я оформлю", "Сейчас переключу", "Перевожу вас".

2) Уточняющие вопросы для выяснения потребности клиента (часто без "?"):
   "А по бюджету как ориентируетесь", "Какой вопрос у вас", "Для какой семьи подбираем",
   "Уже рассматривали конкретные модели или открыты к предложениям", "Сфера вашей деятельности",
   "Опт или розница", "Как вас могу представить", "Что вас интересует".

3) Описание товара/услуги КОНКРЕТНЫМИ числами и терминами:
   "Bosch объём 380 литров", "150 лошадиных сил", "65 тысяч", "от 6 процентов годовых",
   "комплектация Family", "пробег нулевой" — это работник называет характеристики.

4) Деловой/служебный регистр: "Хороший выбор", "Отлично, вы пришли по адресу",
   "Подскажите", "Обратите внимание", "Сейчас оформлю бумаги".

ЯВНЫЕ ТЕКСТОВЫЕ МАРКЕРЫ КЛИЕНТА (C):

1) Местоимения "я / мы с супругой / у меня / у нас [не в значении компания, а семья/личное]":
   "Хотел бы уточнить", "Мы с супругой присматриваем", "У меня вопрос",
   "У нас двое детей", "Мне нужно".

2) Описание СОБСТВЕННОЙ ситуации/проблемы:
   "У нас установлена программа 1С", "Думали про Tucson и RAV4", "Едет очень мягко, я не ожидал",
   "Согласен", "Дороговато", "Мне надо посоветоваться".

3) Короткие ответы на конкретные уточняющие вопросы работника:
   "Опт", "Торговля", "Руслан", "Да", "Нет", "Бензин".

4) Вопросы ПО СУТИ товара/услуги (не процедурные):
   "А сколько стоит", "А расход какой", "А полный привод можно", "А процент какой".

ПРАВИЛА КОНТЕКСТА:

- Если работник спросил «Как вас представить» — следующее имя ("Иван", "Руслан") говорит КЛИЕНТ.
- Если работник сказал «Сейчас переключу на специалиста» — следующие реплики
  «Алло», «Да-да», «Слушаю», «Сергей, это Руслан, у него вопрос…» — это РАБОТНИК-2,
  принявший звонок. Всё ещё S, не C.
- В разговоре может быть несколько работников (переключение между операторами) — все они S.
- Короткие реплики ("Да", "Угу", "Хорошо", "Понятно", "Согласен") — смотри по контексту:
  обычно это короткое подтверждение в ответ на длинную реплику другого участника.
- Если в реплике есть и «у нас», и описание товара/инвентаря с числами/терминами — это РАБОТНИК.
- Если в реплике есть «я / мы с …» и описание собственной потребности — это КЛИЕНТ.

ФОРМАТ ОТВЕТА: ТОЛЬКО строка из N символов (S/C/U) через запятую, где N равно количеству реплик.
Пример для 5 реплик: S,C,S,C,S
БЕЗ комментариев, БЕЗ пояснений, ТОЛЬКО буквы через запятую."""

# Few-shot #1 — колл-центр с переключением между операторами
DIARIZATION_FEW_SHOT_USER_1 = """Реплики (10 шт.):
[0] Компания Первый бит, Анжела, здравствуйте.
[1] Здравствуйте, у нас установлена программа, хочу проконсультироваться.
[2] Какой вопрос у вас?
[3] У нас 1С Бухгалтерия 11-й редакции, нужна помощь.
[4] Подскажите, как вас могу представить?
[5] Руслан.
[6] Сейчас переключу на специалиста.
[7] Алло, Сергей слушает.
[8] Сергей, это Руслан, у него вопрос по 1С.
[9] Хорошо, расскажите подробнее.

Верни строку из 10 букв (S/C/U) через запятую:"""
DIARIZATION_FEW_SHOT_ASSISTANT_1 = "S,C,S,C,S,C,S,S,C,S"

# Few-shot #2 — автосалон, с типичными "вопросами без знака вопроса"
DIARIZATION_FEW_SHOT_USER_2 = """Реплики (12 шт.):
[0] Здравствуйте, добро пожаловать в автосалон, меня зовут Михаил.
[1] Здравствуйте, мы с супругой присматриваем семейный автомобиль.
[2] Отлично, вы пришли по адресу.
[3] Уже рассматривали конкретные модели или открыты к предложениям.
[4] Думали про Hyundai Tucson и Toyota RAV4.
[5] Хороший выбор. У нас в наличии и тот и другой.
[6] А по бюджету как ориентируетесь.
[7] До трёх миллионов, обязательно с автоматом.
[8] Есть Tucson 2024 года, как раз около двух девятисот, автомат, передний привод.
[9] А полный привод в этом бюджете рассматривать можно?
[10] На полный придётся доплатить тысяч триста.
[11] Понятно.

Верни строку из 12 букв (S/C/U) через запятую:"""
DIARIZATION_FEW_SHOT_ASSISTANT_2 = "S,C,S,S,C,S,S,C,S,C,S,C"

SEGMENTATION_SYSTEM_PROMPT = """Ты — система анализа диалогов в розничном магазине.
Тебе дан полный транскрипт рабочего дня продавца с временны́ми метками (в секундах).

Твоя задача — найти границы отдельных разговоров с клиентами.
Разговор — это связная последовательность реплик, относящихся к одному взаимодействию продавца с клиентом.

Признаки начала нового разговора:
- Приветствие ("Здравствуйте", "Добрый день", "Чем могу помочь")
- Смена темы после явного завершения предыдущего разговора
- Большой временной разрыв между репликами (более 2 минут тишины)

Признаки конца разговора:
- Прощание ("До свидания", "Спасибо", "Всего хорошего")
- Резкая смена собеседника

Отвечай ТОЛЬКО валидным JSON: список объектов с полями "start_ms" и "end_ms" (в миллисекундах).
Пример: [{{"start_ms": 0, "end_ms": 185000}}, {{"start_ms": 210000, "end_ms": 380000}}]
Не включай участки с фоновым шумом или тишиной без диалога."""


async def segment_conversations(
    whisper_result: dict,
    llm_client,
) -> list[dict]:
    """
    Принимает результат Whisper (полный транскрипт с временны́ми метками),
    возвращает список границ разговоров: [{"start_ms": int, "end_ms": int}, ...]
    """
    segments = whisper_result.get("segments", [])
    if not segments:
        return []

    segments_text = "\n".join(
        f"[{int(seg['start'] * 1000)}ms - {int(seg['end'] * 1000)}ms] {seg['text']}"
        for seg in segments
    )
    user_prompt = f"Транскрипт рабочего дня:\n{segments_text}\n\nНайди границы разговоров."

    try:
        response = await _create_no_reasoning(
            llm_client,
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": SEGMENTATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=16384,
        )
        raw = response.choices[0].message.content

        if not raw:
            raise ValueError("LLM returned empty content")

        # Strip thinking blocks
        raw = raw.strip()
        if "<think>" in raw:
            raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

        result = json.loads(raw)

        if isinstance(result, list):
            conversations = result
        elif isinstance(result, dict):
            conversations = result.get("conversations",
                           result.get("segments",
                           result.get("boundaries",
                           result.get("dialogs", None))))
            if conversations is None:
                if "start_ms" in result and "end_ms" in result:
                    conversations = [result]
                else:
                    conversations = []
        else:
            conversations = []

        valid = []
        for conv in conversations:
            if "start_ms" in conv and "end_ms" in conv:
                valid.append({"start_ms": int(conv["start_ms"]), "end_ms": int(conv["end_ms"])})

        if valid:
            return valid

        logger.warning("LLM returned no valid conversation boundaries, using full audio as one conversation")
        total_end_ms = int(segments[-1]["end"] * 1000) if segments else 0
        if total_end_ms > 0:
            return [{"start_ms": 0, "end_ms": total_end_ms}]
        return [{"start_ms": 0, "end_ms": len(whisper_result.get("text", "")) * 50}] or []

    except Exception as e:
        logger.error(f"Segmentation LLM error: {e}", exc_info=True)
        total_end_ms = int(segments[-1]["end"] * 1000) if segments else 0
        if total_end_ms > 0:
            return [{"start_ms": 0, "end_ms": total_end_ms}]
        return []


DIARIZE_CHUNK_SIZE = 20

ROLE_MAP = {"s": "seller", "c": "customer", "u": "unknown"}


def roles_by_talk_time(segments: list[dict]) -> list[str]:
    """Роли без LLM, только по спикерам Deepgram: продавец — тот, кто говорит дольше всех
    (бейдж висит на продавце), остальные — покупатели. Сегменты без speaker_id — unknown."""
    talk: dict = {}
    for s in segments:
        sid = s.get("speaker_id")
        if sid is not None:
            talk[sid] = talk.get(sid, 0) + max(0, (s.get("end_ms") or 0) - (s.get("start_ms") or 0))
    if not talk:
        return ["unknown"] * len(segments)
    seller = max(talk, key=talk.get)
    return [
        "unknown" if s.get("speaker_id") is None else ("seller" if s.get("speaker_id") == seller else "customer")
        for s in segments
    ]


# Если разговор длиннее этого — фолбэк на чанкинг (страховка от переполнения контекста LLM).
# 250 сегментов это примерно 15-25 минут непрерывного диалога.
DIARIZE_SINGLE_PASS_LIMIT = 250


async def _diarize_batch(
    batch: list[dict],
    batch_offset: int,
    seller_name: str,
    llm_client,
) -> dict[int, str]:
    """
    Диаризует батч сегментов одним LLM-запросом.
    batch_offset — абсолютный индекс начала батча (для возврата индексов в общую map).
    Возвращает {absolute_index: role}.
    """
    import asyncio as _asyncio

    segments_text = "\n".join(
        f"[{batch_offset + i}] {seg['text']}" for i, seg in enumerate(batch)
    )
    user_prompt = (
        f"Реплики ({len(batch)} шт.):\n{segments_text}\n\n"
        f"Верни строку из {len(batch)} букв (S/C/U) через запятую:"
    )

    # max_tokens: ответ ≈ 1.8 токена на реплику (буква + запятая), плюс крупный запас на
    # «размышление» reasoning-моделей (qwen3.6 тратит ~700 токенов до видимого ответа).
    # Без этого запаса ответ обрезается по длине и приходит пустым.
    max_out = int(len(batch) * 1.8) + 800

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = await _create_no_reasoning(
                llm_client,
                model=settings.LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": DIARIZATION_SYSTEM_PROMPT.format(seller_name=seller_name)},
                    {"role": "user", "content": DIARIZATION_FEW_SHOT_USER_1},
                    {"role": "assistant", "content": DIARIZATION_FEW_SHOT_ASSISTANT_1},
                    {"role": "user", "content": DIARIZATION_FEW_SHOT_USER_2},
                    {"role": "assistant", "content": DIARIZATION_FEW_SHOT_ASSISTANT_2},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                max_tokens=max_out,
                timeout=600,
            )
            raw = response.choices[0].message.content
            logger.info(f"LLM response (offset={batch_offset}, n={len(batch)}): {(raw or '')[:200]}")

            if not raw:
                wait = 5 * (attempt + 1)
                logger.warning(f"Empty content for batch offset={batch_offset}, retry {attempt+1}/{max_retries}")
                await _asyncio.sleep(wait)
                continue

            raw = raw.strip()
            if "<think>" in raw:
                raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

            letters = re.findall(r'[SCU]', raw.upper())

            if len(letters) > len(batch):
                logger.warning(f"Got {len(letters)} roles, expected {len(batch)} (offset={batch_offset}), truncating")
                letters = letters[:len(batch)]
            elif len(letters) < len(batch):
                logger.warning(f"Got {len(letters)} roles, expected {len(batch)} (offset={batch_offset}), padding with U")
                letters.extend(["U"] * (len(batch) - len(letters)))

            return {batch_offset + i: ROLE_MAP.get(letter.lower(), "unknown")
                    for i, letter in enumerate(letters)}

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 5 * (attempt + 1)
                logger.warning(f"LLM error batch offset={batch_offset}: {e}, retry {attempt+1}/{max_retries}")
                await _asyncio.sleep(wait)
            else:
                logger.error(f"Diarization batch error (offset={batch_offset}): {e}")
                return {}

    logger.error(f"All retries failed for batch offset={batch_offset}")
    return {}


async def diarize_segments(
    segments: list[dict],
    seller_name: str,
    llm_client,
) -> list[str]:
    """
    Принимает все сегменты ОДНОГО разговора, возвращает список ролей ["seller", "customer", ...].

    Стратегия: один LLM-запрос на весь разговор (LLM лучше работает с полным контекстом).
    Для аномально длинных разговоров (>DIARIZE_SINGLE_PASS_LIMIT сегментов) — фолбэк на чанкинг.
    """
    if not segments:
        return []

    roles_map: dict[int, str] = {}

    if len(segments) <= DIARIZE_SINGLE_PASS_LIMIT:
        logger.info(f"Diarizing {len(segments)} segments in single pass")
        roles_map = await _diarize_batch(segments, 0, seller_name, llm_client)
    else:
        logger.info(
            f"Diarizing {len(segments)} segments in chunks of {DIARIZE_CHUNK_SIZE} "
            f"(too long for single pass, limit={DIARIZE_SINGLE_PASS_LIMIT})"
        )
        for offset in range(0, len(segments), DIARIZE_CHUNK_SIZE):
            chunk = segments[offset: offset + DIARIZE_CHUNK_SIZE]
            chunk_roles = await _diarize_batch(chunk, offset, seller_name, llm_client)
            roles_map.update(chunk_roles)

    result = [roles_map.get(i, "unknown") for i in range(len(segments))]
    seller_count = result.count("seller")
    customer_count = result.count("customer")
    unknown_count = result.count("unknown")
    logger.info(
        f"Diarization complete: {seller_count} seller, {customer_count} customer, {unknown_count} unknown"
    )
    return result


# ─── Кластерная диаризация на базе speaker_id от Deepgram ────────────────────
# LLM решает не «какая роль у каждой реплики», а «кто из N спикеров — работник».
# Это сильно проще, точнее и дешевле.

SPEAKER_CLASSIFY_SYSTEM_PROMPT = """Ты определяешь, кто из участников разговора — РАБОТНИК (продавец/консультант/оператор/менеджер), а кто — КЛИЕНТ.

В разговоре несколько спикеров, каждый под своим номером (0, 1, 2, ...). Тебе показывают примеры их реплик.
Имя работника: {seller_name}

ПРИЗНАКИ РАБОТНИКА:
- Представляется от имени компании ("Компания N, Имя, здравствуйте")
- Говорит "у нас / в нашем / в наличии / можем предложить" про инвентарь и компанию
- ЗАДАЁТ уточняющие вопросы клиенту ("А по бюджету как", "Какой вопрос у вас", "Сфера деятельности")
- Описывает товар/услугу с конкретными числами и характеристиками
- Управляет ходом разговора, переключает на специалиста

ПРИЗНАКИ КЛИЕНТА:
- Описывает СВОЮ ситуацию ("у меня", "мы с супругой", "у нас [семья]")
- Запрашивает информацию по продукту/цене ("сколько стоит", "а полный привод можно")
- Выражает потребность, сомнения, возражения

ВАЖНО: в одном разговоре может быть НЕСКОЛЬКО работников (переключение между операторами).
Все они — работники.

ФОРМАТ ОТВЕТА: ТОЛЬКО строка вида
WORKERS: 0,2
где после двоеточия — номера спикеров-работников через запятую.
Все остальные спикеры автоматически считаются клиентами.
БЕЗ комментариев и пояснений."""


def _build_speaker_examples(segments: list[dict], max_per_speaker: int = 15) -> tuple[dict[int, list[str]], list[int]]:
    """
    Группирует сегменты по speaker_id, берёт до max_per_speaker реплик каждого.
    Возвращает: ({speaker_id: [тексты]}, [уникальные speaker_id отсортированно]).
    """
    by_speaker: dict[int, list[str]] = {}
    for seg in segments:
        sid = seg.get("speaker_id")
        if sid is None:
            continue
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        by_speaker.setdefault(sid, []).append(text)

    # Если у спикера слишком много реплик — берём начало, середину и конец (репрезентативная выборка)
    sampled = {}
    for sid, texts in by_speaker.items():
        if len(texts) <= max_per_speaker:
            sampled[sid] = texts
        else:
            third = max_per_speaker // 3
            head = texts[:third]
            mid_start = (len(texts) - third) // 2
            mid = texts[mid_start: mid_start + third]
            tail = texts[-(max_per_speaker - 2 * third):]
            sampled[sid] = head + mid + tail

    speakers = sorted(sampled.keys())
    return sampled, speakers


async def identify_speaker_roles(
    segments: list[dict],
    seller_name: str,
    llm_client,
) -> dict[int, str]:
    """
    Классифицирует спикеров (по speaker_id из Deepgram) на работников и клиентов.

    Args:
        segments: список с полями text, speaker_id (хотя бы у части)
        seller_name: имя работника (для контекста промпта)
        llm_client: AsyncOpenAI

    Returns:
        {speaker_id: "seller" | "customer"} для всех уникальных speaker_id.
        Если LLM не смог определить — пустой dict (вызывающий код должен поставить unknown).
    """
    import asyncio as _asyncio

    examples, speakers = _build_speaker_examples(segments)

    if not speakers:
        logger.warning("identify_speaker_roles: no speaker_id in segments")
        return {}

    # Если только один спикер — это однозначно работник (диаризация Deepgram не разделила,
    # либо реально один говорящий, например приветствие в пустоту).
    if len(speakers) == 1:
        logger.info(f"Single speaker {speakers[0]} — labelling as seller by default")
        return {speakers[0]: "seller"}

    # Формируем юзерский промпт с примерами реплик каждого спикера
    blocks = []
    for sid in speakers:
        lines = "\n".join(f"  - {t}" for t in examples[sid])
        blocks.append(f"Speaker {sid}:\n{lines}")
    user_prompt = (
        f"Имя работника: {seller_name}\n"
        f"Уникальных спикеров: {len(speakers)} (номера: {', '.join(map(str, speakers))})\n\n"
        + "\n\n".join(blocks)
        + "\n\nКто из этих спикеров — работник(и)?"
    )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = await _create_no_reasoning(
                llm_client,
                model=settings.LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": SPEAKER_CLASSIFY_SYSTEM_PROMPT.format(seller_name=seller_name)},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                # Запас на случай фолбэка (reasoning не отключился у другого провайдера).
                max_tokens=1024,
                timeout=120,
            )
            raw = (response.choices[0].message.content or "").strip()
            logger.info(f"Speaker classify response: {raw[:200]}")

            if not raw:
                wait = 5 * (attempt + 1)
                logger.warning(f"Empty response, retry {attempt + 1}/{max_retries}")
                await _asyncio.sleep(wait)
                continue

            # Парсим "WORKERS: 0,2" (может быть с пробелами, разными разделителями).
            # БЕЗ fallback "извлечь все числа" — он схватывал ID спикеров из объяснений
            # вида "Speaker 0 — работник, Speaker 1 — клиент" и помечал ВСЕХ как работников.
            match = re.search(r"WORKERS\s*:\s*([\d,\s]+)", raw, re.IGNORECASE)
            if match:
                worker_ids = {int(x) for x in re.findall(r"\d+", match.group(1))}
            else:
                logger.warning(f"No 'WORKERS:' in response (raw={raw!r}), defaulting first speaker as worker")
                worker_ids = {speakers[0]}

            # Фильтруем по реально существующим спикерам
            worker_ids = worker_ids & set(speakers)

            if not worker_ids:
                logger.warning(f"No valid worker IDs after filtering (raw={raw!r}), defaulting first speaker as worker")
                worker_ids = {speakers[0]}

            # Защита: если LLM пометил ВСЕХ спикеров как работников — это явно ошибка.
            # В реальном диалоге всегда есть как минимум один клиент.
            if len(worker_ids) == len(speakers) and len(speakers) > 1:
                logger.warning(
                    f"LLM marked all {len(speakers)} speakers as workers (raw={raw!r}). "
                    f"Falling back to: speaker with most words = worker."
                )
                word_counts = {sid: sum(len(t.split()) for t in examples.get(sid, [])) for sid in speakers}
                top_speaker = max(word_counts, key=word_counts.get)
                worker_ids = {top_speaker}

            roles = {sid: ("seller" if sid in worker_ids else "customer") for sid in speakers}
            logger.info(
                f"Speaker roles: workers={sorted(worker_ids)}, "
                f"customers={sorted(set(speakers) - worker_ids)}"
            )
            return roles

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 5 * (attempt + 1)
                logger.warning(f"Speaker classify error: {e}, retry {attempt + 1}/{max_retries}")
                await _asyncio.sleep(wait)
            else:
                logger.error(f"Speaker classify failed after retries: {e}")
                return {}

    return {}
