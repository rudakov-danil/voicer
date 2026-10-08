import logging
import sys

from openai import AsyncOpenAI, BadRequestError

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def get_llm_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        base_url = settings.LLM_SERVER_URL
        if not base_url.endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"
        extra_headers = {}
        if settings.LLM_EXTRA_HEADER_NAME and settings.LLM_EXTRA_HEADER_VALUE:
            extra_headers[settings.LLM_EXTRA_HEADER_NAME] = settings.LLM_EXTRA_HEADER_VALUE
        _client = AsyncOpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=base_url,
            project=settings.LLM_FOLDER_ID or None,
            default_headers=extra_headers or None,
        )
        _client.chat.completions.create = _without_thinking(_client.chat.completions.create)
    return _client


def _without_thinking(create):
    """Все запросы к модели — без рассуждений (thinking): reasoning.enabled=false для OpenRouter.
    Если провайдер этот параметр не принимает, один раз запоминаем и дальше шлём без него.
    Расход токенов каждого запроса пишется в лог строкой «LLM usage»."""
    supported = True

    async def wrapper(*args, **kwargs):
        nonlocal supported
        step = _caller()
        if settings.LLM_DISABLE_THINKING and supported:
            extra = {**(kwargs.get("extra_body") or {}), "reasoning": {"enabled": False}}
            try:
                return _log_usage(step, await create(*args, **{**kwargs, "extra_body": extra}))
            except BadRequestError as e:
                if "reasoning" not in str(e):
                    raise
                supported = False
                logger.warning("Provider rejected reasoning=disabled; sending requests without it")
        return _log_usage(step, await create(*args, **kwargs))

    return wrapper


def _caller() -> str:
    """Функция, из которой пришёл запрос к модели, — чтобы считать токены по этапам."""
    try:
        f = sys._getframe(2)
    except ValueError:
        return "?"
    while f is not None and f.f_code.co_name.startswith("_create"):
        f = f.f_back
    return f.f_code.co_name if f is not None else "?"


def _log_usage(step: str, response):
    u = getattr(response, "usage", None)
    if u is not None:
        details = getattr(u, "completion_tokens_details", None)
        logger.info(
            "LLM usage: step=%s model=%s prompt=%s completion=%s reasoning=%s total=%s cost=%s",
            step, getattr(response, "model", "?"), getattr(u, "prompt_tokens", None),
            getattr(u, "completion_tokens", None), getattr(details, "reasoning_tokens", None),
            getattr(u, "total_tokens", None), getattr(u, "cost", None),
        )
    return response
