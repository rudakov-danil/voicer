"""Клиент к OpenAI-совместимому LLM-эндпоинту + защитный разбор JSON-ответа.

Конфигурация совпадает с основным стеком Voicer (Yandex Cloud / OpenRouter / Ollama),
поэтому переменные окружения можно переиспользовать как есть.
"""
import json
import logging
import re

from openai import AsyncOpenAI, BadRequestError

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


class LLMError(RuntimeError):
    """Ошибка обращения к модели. raw хранит сырой ответ, если он был получен."""

    def __init__(self, message: str, raw: str = ""):
        super().__init__(message)
        self.raw = raw


# Провайдер может не понимать reasoning_effort. Первый отказ запоминаем и больше
# не пытаемся — иначе каждый запрос стоил бы двух. Тот же приём, что в
# transcription-service/app/diarization.py основного стека.
_thinking_param_supported = True


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        base_url = settings.LLM_SERVER_URL
        if not base_url.endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"
        extra_headers = {}
        if settings.LLM_EXTRA_HEADER_NAME and settings.LLM_EXTRA_HEADER_VALUE:
            extra_headers[settings.LLM_EXTRA_HEADER_NAME] = settings.LLM_EXTRA_HEADER_VALUE
        _client = AsyncOpenAI(
            base_url=base_url,
            api_key=settings.LLM_API_KEY,
            project=settings.LLM_FOLDER_ID or None,
            default_headers=extra_headers or None,
            timeout=settings.LLM_TIMEOUT,
        )
    return _client


async def chat_json(system: str, user: str, max_tokens: int | None = None) -> dict:
    """Один запрос к модели с ожиданием JSON-объекта в ответе."""
    global _thinking_param_supported

    if not settings.LLM_MODEL_NAME:
        raise LLMError("LLM_MODEL_NAME не задан")

    kwargs = {
        "model": settings.LLM_MODEL_NAME,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens or settings.LLM_MAX_TOKENS,
    }
    if settings.LLM_DISABLE_THINKING and _thinking_param_supported:
        kwargs["extra_body"] = {"reasoning_effort": "none"}

    try:
        resp = await get_client().chat.completions.create(**kwargs)
    except BadRequestError as exc:
        if "extra_body" not in kwargs or "reasoning_effort" not in str(exc):
            raise
        logger.warning("Провайдер не поддерживает reasoning_effort, работаем без него")
        _thinking_param_supported = False
        kwargs.pop("extra_body")
        resp = await get_client().chat.completions.create(**kwargs)

    choice = resp.choices[0]
    raw = (choice.message.content or "").strip()
    if not raw:
        if choice.finish_reason == "length":
            raise LLMError(
                "модель израсходовала весь лимит токенов на reasoning и не дала ответ — "
                "увеличь LLM_MAX_TOKENS или включи LLM_DISABLE_THINKING"
            )
        raise LLMError("модель вернула пустой ответ")

    try:
        return extract_json(raw)
    except LLMError as exc:
        # Ответ мог оборваться на середине JSON — отдаём сырой текст наверх,
        # чтобы вызывающий код попробовал спасти уцелевшие объекты.
        raise LLMError(str(exc), raw=raw) from None


def extract_json(raw: str) -> dict:
    """Достаёт JSON-объект из ответа модели.

    Модели регулярно оборачивают JSON в ```-блок или добавляют пояснение до/после,
    поэтому сначала пробуем распарсить как есть, затем снимаем обёртку, затем
    вырезаем самый внешний {...}.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(.+?)```", raw, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1).strip())
        except json.JSONDecodeError:
            pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise LLMError(f"не удалось разобрать JSON из ответа модели: {raw[:300]}")


def salvage_objects(raw: str, required: tuple[str, ...]) -> list[dict]:
    """Достаёт целые JSON-объекты из оборванного ответа.

    Когда ответ обрезан по лимиту токенов, последний объект неполный, но всё,
    что модель успела выдать до него, — валидно и его жалко терять.
    """
    found: list[dict] = []
    depth = 0
    start = -1
    for i, ch in enumerate(raw):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth:
            depth -= 1
            if depth == 0 and start != -1:
                try:
                    obj = json.loads(raw[start:i + 1])
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict) and all(k in obj for k in required):
                    found.append(obj)
    return found
