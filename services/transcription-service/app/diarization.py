import json
import logging
import re

from app.config import settings

logger = logging.getLogger(__name__)

DIARIZATION_SYSTEM_PROMPT = """Ты — экспертная система диаризации разговоров в розничной торговле.
Тебе дан пронумерованный список реплик из разговора между ПРОДАВЦОМ (S) и КЛИЕНТОМ (C).
Имя продавца: {seller_name}

МАРКЕРЫ ПРОДАВЦА (S):
- Приветствие от имени компании/магазина
- Представление себя, выяснение потребностей
- Презентация товара, работа с возражениями
- Предложение доп. товаров, закрытие сделки
- Прощание от лица магазина

МАРКЕРЫ КЛИЕНТА (C):
- Запрос информации, описание потребности
- Ценовые возражения, сомнения
- Согласие/отказ от покупки

ПРАВИЛА:
1. Разговор обычно начинается с приветствия ПРОДАВЦА
2. Реплики одного спикера могут идти подряд
3. Короткие реплики ("Да", "Нет", "Угу") — определяй по контексту
4. Используй U (unknown) только если совсем невозможно определить

ФОРМАТ ОТВЕТА: Верни ТОЛЬКО строку из символов S, C или U — по одному на каждую реплику, через запятую.
Пример для 5 реплик: S,C,S,C,S
Никакого другого текста, только буквы через запятую."""

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
        response = await llm_client.chat.completions.create(
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


DIARIZE_CHUNK_SIZE = 40

ROLE_MAP = {"s": "seller", "c": "customer", "u": "unknown"}


async def _diarize_chunk(
    chunk: list[dict],
    chunk_offset: int,
    seller_name: str,
    llm_client,
) -> dict[int, str]:
    """Diarize a single chunk. Returns {absolute_index: role}."""
    segments_text = "\n".join(
        f"[{chunk_offset + i}] {seg['text']}" for i, seg in enumerate(chunk)
    )
    user_prompt = f"Реплики ({len(chunk)} шт.):\n{segments_text}\n\nВерни строку из {len(chunk)} букв (S/C/U) через запятую:"

    import asyncio as _asyncio

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = await llm_client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": DIARIZATION_SYSTEM_PROMPT.format(seller_name=seller_name)},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                max_tokens=2048,
                timeout=600,
            )
            raw = response.choices[0].message.content
            logger.info(f"LLM response (offset={chunk_offset}): {(raw or '')[:200]}")

            if not raw:
                wait = 30 * (attempt + 1)
                logger.warning(f"Empty content for chunk {chunk_offset}, retry {attempt+1}/{max_retries}")
                await _asyncio.sleep(wait)
                continue

            # Strip thinking blocks
            raw = raw.strip()
            if "<think>" in raw:
                raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

            # Parse compact format: "S,C,S,C,S" or "S, C, S, C, S" or "SCSCS"
            # Extract only S/C/U letters
            letters = re.findall(r'[SCU]', raw.upper())

            if len(letters) >= len(chunk):
                letters = letters[:len(chunk)]
            elif len(letters) < len(chunk):
                logger.warning(f"Expected {len(chunk)} roles, got {len(letters)} for chunk {chunk_offset}")
                # Pad with unknown
                letters.extend(["U"] * (len(chunk) - len(letters)))

            result = {}
            for i, letter in enumerate(letters):
                result[chunk_offset + i] = ROLE_MAP.get(letter.lower(), "unknown")
            return result

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                logger.warning(f"LLM error chunk {chunk_offset}: {e}, retry {attempt+1}/{max_retries}")
                await _asyncio.sleep(wait)
            else:
                logger.error(f"Diarization chunk error (offset={chunk_offset}): {e}")
                return {}

    logger.error(f"All retries failed for chunk {chunk_offset}")
    return {}


async def diarize_segments(
    segments: list[dict],
    seller_name: str,
    llm_client,
) -> list[str]:
    """
    Принимает список сегментов, возвращает список ролей ["seller", "customer", ...].
    """
    if not segments:
        return []

    roles_map: dict[int, str] = {}

    for offset in range(0, len(segments), DIARIZE_CHUNK_SIZE):
        chunk = segments[offset: offset + DIARIZE_CHUNK_SIZE]
        chunk_roles = await _diarize_chunk(chunk, offset, seller_name, llm_client)
        roles_map.update(chunk_roles)
        logger.info(
            f"Diarized chunk {offset}-{offset + len(chunk) - 1}: "
            f"{sum(1 for r in chunk_roles.values() if r == 'seller')} seller, "
            f"{sum(1 for r in chunk_roles.values() if r == 'customer')} customer"
        )

    result = [roles_map.get(i, "unknown") for i in range(len(segments))]
    seller_count = result.count("seller")
    customer_count = result.count("customer")
    unknown_count = result.count("unknown")
    logger.info(f"Diarization complete: {seller_count} seller, {customer_count} customer, {unknown_count} unknown")
    return result
