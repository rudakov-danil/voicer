"""Генерация компактного названия скрипта (1–3 слова) — для UI и аналитики."""
import re
import logging
from app.llm_client import get_llm_client
from app.config import settings

logger = logging.getLogger(__name__)

# Слова, которые встречаются в большинстве названий и ничего не добавляют.
_STOP_PREFIXES = re.compile(
    r'^(стандартн(ый|ая|ое)|базов(ый|ая|ое)|улучшенн(ый|ая|ое)|новый|основной)\s+',
    re.IGNORECASE,
)
_SCRIPT_WORDS = re.compile(
    r'^(скрипт(ы|а|у)?|сценарий|шаблон(ы|а)?)\s+',
    re.IGNORECASE,
)
_SALES_WORDS = re.compile(
    r'^(продаж(и|а|у|ей)?|продаже|для\s+продаж(и|а)?)\s+',
    re.IGNORECASE,
)


def heuristic_short_name(name: str) -> str:
    """Эвристика: убираем общие префиксы. Работает оффлайн."""
    s = (name or '').strip()
    if not s:
        return ''
    # Несколько проходов, т.к. префиксы могут быть в любом порядке
    for _ in range(4):
        prev = s
        s = _STOP_PREFIXES.sub('', s)
        s = _SCRIPT_WORDS.sub('', s)
        s = _SALES_WORDS.sub('', s)
        if s == prev:
            break
    s = s.strip(' .,;-—:')
    if not s:
        s = (name or '').strip()[:40]
    # Капитализация первой буквы (не TitleCase, чтобы не ломать "1С", "ВКонтакте" и т.п.)
    if s and s[0].isalpha():
        s = s[0].upper() + s[1:]
    return s[:60]


async def llm_short_name(name: str, description: str | None = None) -> str | None:
    """LLM-генерация компактного названия. None при ошибке/таймауте."""
    try:
        client = get_llm_client()
        prompt = (
            "Сгенерируй компактное название категории (1–3 слова) для скрипта продаж.\n"
            "Только сама категория, без кавычек, в именительном падеже.\n\n"
            "Примеры:\n"
            "- \"Стандартный скрипт продаж 1С\" → 1С\n"
            "- \"Скрипт продаж бытовой техники\" → Бытовая техника\n"
            "- \"Продажи автомобилей премиум\" → Автомобили\n"
            "- \"Скрипт для b2b-холодных звонков\" → B2B звонки\n\n"
            f"Название: \"{(name or '').strip()}\"\n"
        )
        if description:
            prompt += f"Описание: \"{description.strip()[:240]}\"\n"
        prompt += "\nКороткое название:"

        resp = await client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": "Ты помощник для категоризации скриптов продаж."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            timeout=8.0,
        )
        text = (resp.choices[0].message.content or '').strip()
        # Чистим кавычки, переносы, лишний текст
        text = text.strip(' "\'`«»\n\r\t.,;:')
        text = text.split('\n')[0].strip()
        if not text or len(text) > 60:
            return None
        return text
    except Exception as e:
        logger.warning("LLM short_name generation failed: %s", e)
        return None


async def derive_short_name(name: str, description: str | None = None) -> str:
    """Главная точка: LLM → fallback heuristic. Всегда что-то возвращает."""
    s = (name or '').strip()
    if not s:
        return ''
    out = await llm_short_name(s, description)
    if out:
        return out[:60]
    return heuristic_short_name(s)
