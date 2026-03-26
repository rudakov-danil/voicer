import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)

DIARIZATION_SYSTEM_PROMPT = """Ты — система анализа разговоров в розничном магазине.
Тебе дан список реплик разговора с временны́ми метками.
В разговоре участвуют ПРОДАВЕЦ и КЛИЕНТ (иногда несколько клиентов).
Имя продавца: {seller_name}

Твоя задача — для каждой реплики определить роль говорящего: "seller" или "customer".

Правила:
- Приветствия ("Здравствуйте, чем могу помочь") — обычно продавец
- Вопросы о характеристиках товара — обычно клиент
- Презентация товара — обычно продавец
- Ценовые возражения ("дорого", "а есть дешевле") — обычно клиент
- При неопределённости — ставь "unknown"

Отвечай ТОЛЬКО валидным JSON-объектом с ключом "roles" — массивом объектов с полями "index" и "role".
Пример: {{"roles": [{{"index": 0, "role": "seller"}}, {{"index": 1, "role": "customer"}}]}}"""

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
Пример: [{"start_ms": 0, "end_ms": 185000}, {"start_ms": 210000, "end_ms": 380000}]
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
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        result = json.loads(raw)

        # Handle list, {"conversations": [...]}, {"start_ms":..,"end_ms":..} (single obj), etc.
        if isinstance(result, list):
            conversations = result
        elif isinstance(result, dict):
            # Try known wrapper keys first
            conversations = result.get("conversations",
                           result.get("segments",
                           result.get("boundaries",
                           result.get("dialogs", None))))
            if conversations is None:
                # Maybe LLM returned a single conversation object directly
                if "start_ms" in result and "end_ms" in result:
                    conversations = [result]
                else:
                    conversations = []
        else:
            conversations = []

        # Validate structure
        valid = []
        for conv in conversations:
            if "start_ms" in conv and "end_ms" in conv:
                valid.append({"start_ms": int(conv["start_ms"]), "end_ms": int(conv["end_ms"])})

        if valid:
            return valid

        # Fallback: treat entire audio as one conversation
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
    user_prompt = f"Реплики разговора:\n{segments_text}\n\nОпредели роли."

    try:
        response = await llm_client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": DIARIZATION_SYSTEM_PROMPT.format(seller_name=seller_name)},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=len(chunk) * 30 + 100,
            timeout=300,
        )
        raw = response.choices[0].message.content

        # Strip markdown code blocks if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)

        if isinstance(result, dict):
            roles_list = result.get("roles", result.get("segments", result.get("data", [])))
        elif isinstance(result, list):
            roles_list = result
        else:
            roles_list = []

        return {
            item["index"]: item["role"]
            for item in roles_list
            if isinstance(item, dict) and "index" in item and "role" in item
        }
    except Exception as e:
        logger.error(f"Diarization chunk error (offset={chunk_offset}): {e}")
        return {}


async def diarize_segments(
    segments: list[dict],
    seller_name: str,
    llm_client,
) -> list[str]:
    """
    Принимает список сегментов Whisper, возвращает список ролей ["seller", "customer", ...].
    Обрабатывает сегменты чанками по DIARIZE_CHUNK_SIZE штук.
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
