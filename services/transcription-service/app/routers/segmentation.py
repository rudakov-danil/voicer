"""Внутренний endpoint разбиения транскрипта на разговоры.

Та же segment_conversations, что у записей бейджа (transcribe_worker), — для сервисов,
у которых нет своей LLM: recorder-service зовёт его после ручной загрузки файла.
Доступ только по X-Internal-Key.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.diarization import segment_conversations
from app.llm_client import get_llm_client

router = APIRouter(prefix="/api/v1/transcription/internal", tags=["segmentation"])


class SegmentIn(BaseModel):
    start: float  # секунды, как в ответе Deepgram/Whisper
    end: float
    text: str


class SegmentRequest(BaseModel):
    segments: list[SegmentIn]


@router.post("/segment-conversations")
async def segment(body: SegmentRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "service":
        raise HTTPException(status_code=403, detail="Internal endpoint")
    segments = [s.model_dump() for s in body.segments if s.text.strip()]
    conversations = await segment_conversations({"segments": segments}, get_llm_client())
    return {"conversations": conversations}
