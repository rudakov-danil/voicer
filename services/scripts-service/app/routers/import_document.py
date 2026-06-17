"""Импорт полнотекстового скрипта из документа (DOCX/PDF/RTF/TXT).

Двухшаговый мастер:
1. POST /templates/import-document — файл → извлечение текста → LLM-структуризация
   на блоки. НИЧЕГО не сохраняет, возвращает черновик для предпросмотра и правки.
2. Пользователь правит блоки на фронте и сохраняет обычным POST /templates
   с script_type=fulltext и списком blocks.
"""
import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_current_user
from app.document_parser import DocumentParseError, parse_document
from app.llm_client import get_llm_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/scripts/templates", tags=["import-document"])

MAX_FILE_BYTES = 20 * 1024 * 1024

STRUCTURE_SYSTEM_PROMPT = """Ты — методолог скриптов продаж и обслуживания.
Тебе дан полный текст скрипта разговора (телефонного или офлайн), загруженный из документа компании.

Разбей его на последовательные смысловые блоки — так, чтобы по каждому блоку можно было
проверить «проговорил ли сотрудник это клиенту». Правила разбивки:
- Блок = одна фраза-обязательство или цельная смысловая секция (приветствие, представление,
  выяснение потребности, презентация, конкретное предложение, ответ на возражение, завершение).
- Сохраняй исходные формулировки фраз ДОСЛОВНО — не переписывай и не сокращай текст блока.
- Служебный мусор (номера страниц, колонтитулы, оглавление) — пропускай.
- Ответы на возражения и ситуативные ветки («если клиент скажет…») помечай is_mandatory=false.
- Обычно получается 5–25 блоков. Не дроби на отдельные предложения без необходимости.

block_type — одно из: greeting, identification, need_discovery, presentation,
offer, objection_response, closing, other.

Верни СТРОГО валидный JSON:
{
  "name": "<короткое название скрипта по содержанию документа>",
  "description": "<1-2 предложения: для каких разговоров этот скрипт>",
  "blocks": [
    {
      "title": "<короткое название блока>",
      "text": "<полный текст блока из документа, дословно>",
      "block_type": "<тип>",
      "is_mandatory": <true|false>
    }
  ]
}"""

ALLOWED_BLOCK_TYPES = {
    "greeting", "identification", "need_discovery", "presentation",
    "offer", "objection_response", "closing", "other",
}


class DraftBlock(BaseModel):
    title: str
    text: str
    block_type: str = "other"
    is_mandatory: bool = True


class ImportDraftResponse(BaseModel):
    file_name: str
    full_text: str
    name_suggestion: str
    description_suggestion: str
    blocks: list[DraftBlock]


@router.post("/import-document", response_model=ImportDraftResponse)
async def import_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(400, "Файл слишком большой (макс. 20 МБ)")

    filename = file.filename or "document.txt"
    try:
        full_text = parse_document(file_bytes, filename)
    except DocumentParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    blocks, name_suggestion, description_suggestion = await _structure_with_llm(full_text)

    return ImportDraftResponse(
        file_name=filename,
        full_text=full_text,
        name_suggestion=name_suggestion,
        description_suggestion=description_suggestion,
        blocks=blocks,
    )


async def _structure_with_llm(full_text: str) -> tuple[list[DraftBlock], str, str]:
    """LLM-разбивка документа на блоки. При сбое LLM — эвристический fallback
    (разбивка по пустым строкам), чтобы импорт не падал целиком."""
    client = get_llm_client()
    try:
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": STRUCTURE_SYSTEM_PROMPT},
                {"role": "user", "content": f"Текст документа скрипта:\n\n{full_text}"},
            ],
            temperature=0.0,
            max_tokens=8000,
            response_format={"type": "json_object"},
            timeout=settings.LLM_TIMEOUT,
        )
        data = json.loads(response.choices[0].message.content)
        raw_blocks = data.get("blocks") or []
        blocks: list[DraftBlock] = []
        for rb in raw_blocks:
            if not isinstance(rb, dict):
                continue
            text = str(rb.get("text") or "").strip()
            if not text:
                continue
            block_type = str(rb.get("block_type") or "other")
            blocks.append(DraftBlock(
                title=str(rb.get("title") or "Блок")[:255],
                text=text,
                block_type=block_type if block_type in ALLOWED_BLOCK_TYPES else "other",
                is_mandatory=bool(rb.get("is_mandatory", True)),
            ))
        if blocks:
            return (
                blocks,
                str(data.get("name") or "Импортированный скрипт")[:255],
                str(data.get("description") or "")[:2000],
            )
        logger.warning("LLM returned no usable blocks, falling back to heuristic split")
    except Exception as e:
        logger.error("LLM structuring failed: %s", e)

    return _heuristic_blocks(full_text), "Импортированный скрипт", ""


def _heuristic_blocks(full_text: str) -> list[DraftBlock]:
    """Fallback: блоки по абзацам (пустая строка = граница), мелкие абзацы склеиваются."""
    paragraphs = [p.strip() for p in full_text.split("\n\n") if p.strip()]
    blocks: list[DraftBlock] = []
    buffer = ""
    for p in paragraphs:
        buffer = f"{buffer}\n\n{p}".strip() if buffer else p
        if len(buffer) >= 200:
            blocks.append(_make_heuristic_block(buffer, len(blocks) + 1))
            buffer = ""
    if buffer:
        blocks.append(_make_heuristic_block(buffer, len(blocks) + 1))
    return blocks or [_make_heuristic_block(full_text, 1)]


def _make_heuristic_block(text: str, n: int) -> DraftBlock:
    first_line = text.split("\n", 1)[0]
    title = first_line[:60] if len(first_line) <= 60 else f"Блок {n}"
    return DraftBlock(title=title, text=text, block_type="other", is_mandatory=True)
