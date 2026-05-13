from openai import AsyncOpenAI
from app.config import settings

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
            default_headers=extra_headers or None,
        )
    return _client
