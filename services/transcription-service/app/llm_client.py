import logging

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
            base_url=base_url,
            api_key=settings.LLM_API_KEY,
            project=settings.LLM_FOLDER_ID or None,
            default_headers=extra_headers or None,
        )
        _client.chat.completions.create = _without_thinking(_client.chat.completions.create)
    return _client


def _without_thinking(create):
    """Все запросы к модели — без рассуждений (thinking): reasoning.enabled=false для OpenRouter.
    Если провайдер этот параметр не принимает, один раз запоминаем и дальше шлём без него."""
    supported = True

    async def wrapper(*args, **kwargs):
        nonlocal supported
        if settings.LLM_DISABLE_THINKING and supported:
            extra = {**(kwargs.get("extra_body") or {}), "reasoning": {"enabled": False}}
            try:
                return await create(*args, **{**kwargs, "extra_body": extra})
            except BadRequestError as e:
                if "reasoning" not in str(e):
                    raise
                supported = False
                logger.warning("Provider rejected reasoning=disabled; sending requests without it")
        return await create(*args, **kwargs)

    return wrapper
