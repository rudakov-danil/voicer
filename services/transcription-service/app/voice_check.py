"""Проверка спикера по голосу там, где Deepgram не уверен (обычно люди перебивают друг друга).

Для каждой сомнительной реплики считается голосовой отпечаток (ECAPA, SpeechBrain) и
сравнивается с голосами спикеров из уверенных реплик. Куски, где одновременно звучат
две реплики, в отпечаток не берутся. LLM здесь не участвует: по тексту такие фразы
часто читаются двояко («Не, я думаю…» после вопроса), а по голосу различаются.
"""
import asyncio
import logging
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable

import numpy as np

from app.diarization import uncertain_speaker_indexes
from app.minio_client import download_bytes

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
MIN_AUDIO_MS = 500          # короче отпечаток ненадёжен
MIN_MARGIN = 0.1            # насколько голос должен быть ближе к одному спикеру, чем к другому
MAX_REFERENCE_MS = 60_000   # голос спикера — по первой минуте его уверенных реплик
MODEL_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"
MODEL_DIR = "/opt/ecapa"    # модель скачивается при сборке образа (Dockerfile)

Parts = list[tuple[int, int]]
Embed = Callable[[Parts], "np.ndarray | None"]

_model = None


def clean_parts(segments: list[dict], i: int) -> Parts:
    """Куски реплики i в мс, где не звучат другие реплики: на перекрытии слышны два голоса."""
    parts = [(segments[i]["start_ms"], segments[i]["end_ms"])]
    for j, other in enumerate(segments):
        if j == i:
            continue
        start, end = other["start_ms"], other["end_ms"]
        cut = []
        for a, b in parts:
            if end <= a or start >= b:
                cut.append((a, b))
                continue
            if start > a:
                cut.append((a, start))
            if end < b:
                cut.append((end, b))
        parts = cut
    return [(a, b) for a, b in parts if b - a >= 200]


def _length(parts: Parts) -> int:
    return sum(b - a for a, b in parts)


def resolve_by_voice(segments: list[dict], embed: Embed) -> tuple[list, dict]:
    """Спикер каждой реплики после сравнения голосов и подробности для лога:
    {номер реплики: (решение, {спикер: сходство})}. embed — нормированный отпечаток кусков аудио."""
    current = [s.get("speaker_id") for s in segments]
    uncertain = uncertain_speaker_indexes(segments)
    marked = set(uncertain)
    confident = [i for i, sid in enumerate(current) if i not in marked and sid is not None]
    if not uncertain or len({current[i] for i in confident}) < 2:
        return current, {}

    refs = {}
    for sid in sorted({current[i] for i in confident}):
        parts: Parts = []
        for i in confident:
            if current[i] == sid:
                parts += clean_parts(segments, i)
        reference: Parts = []
        for a, b in parts:
            left = MAX_REFERENCE_MS - _length(reference)
            if left <= 0:
                break
            reference.append((a, min(b, a + left)))
        vec = embed(reference) if _length(reference) >= MIN_AUDIO_MS else None
        if vec is not None:
            refs[sid] = vec
    if len(refs) < 2:
        return current, {"skipped": "у спикеров мало уверенного звука"}

    ids = list(current)
    details: dict = {}
    for i in uncertain:
        parts = clean_parts(segments, i)
        if _length(parts) < MIN_AUDIO_MS:
            # Без перекрытий звука мало — сравниваем весь отрезок реплики
            parts = [(segments[i]["start_ms"], segments[i]["end_ms"])]
        vec = embed(parts) if _length(parts) >= MIN_AUDIO_MS else None
        sims = {sid: float(np.dot(vec, ref)) for sid, ref in refs.items()} if vec is not None else {}
        ranked = sorted(sims.items(), key=lambda kv: kv[1], reverse=True)
        if len(ranked) >= 2 and ranked[0][1] - ranked[1][1] >= MIN_MARGIN:
            ids[i] = ranked[0][0]
            details[i] = ("voice", sims)
            continue
        # Голос не решил. Спикер Deepgram остаётся, если у него есть уверенные реплики;
        # иначе это лишний кластер — берём спикера предыдущей реплики (или следующей уверенной)
        if current[i] not in refs:
            before = next((ids[j] for j in range(i - 1, -1, -1) if ids[j] in refs), None)
            after = next((current[j] for j in range(i + 1, len(segments)) if j not in marked and current[j] in refs), None)
            ids[i] = before if before is not None else after if after is not None else current[i]
        details[i] = ("undecided", sims)
    return ids, details


def _load_model():
    global _model
    if _model is None:
        import torch
        from speechbrain.inference.speaker import EncoderClassifier

        torch.set_num_threads(2)
        _model = EncoderClassifier.from_hparams(source=MODEL_SOURCE, savedir=MODEL_DIR, run_opts={"device": "cpu"})
    return _model


def _decode(audio: bytes, suffix: str) -> np.ndarray:
    """Аудио любого формата → моно 16 кГц float32. Через файл: mp4/m4a из канала ffmpeg не читает."""
    with tempfile.NamedTemporaryFile(suffix=suffix or ".wav") as f:
        f.write(audio)
        f.flush()
        pcm = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", f.name, "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
            capture_output=True, check=True, timeout=600,
        ).stdout
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def _embedder(wav: np.ndarray) -> Embed:
    import torch

    model = _load_model()
    per_ms = SAMPLE_RATE // 1000

    def embed(parts: Parts):
        chunks = [wav[a * per_ms:b * per_ms] for a, b in parts]
        audio = np.concatenate(chunks) if chunks else np.zeros(0, np.float32)
        if len(audio) < MIN_AUDIO_MS * per_ms:
            return None
        with torch.no_grad():
            vec = model.encode_batch(torch.from_numpy(audio.copy()).unsqueeze(0)).squeeze().numpy()
        return vec / (np.linalg.norm(vec) or 1.0)

    return embed


def _check(segments: list[dict], audio_path: str) -> tuple[list, dict]:
    bucket, _, name = audio_path.partition("/")
    wav = _decode(download_bytes(bucket, name), Path(name).suffix)
    return resolve_by_voice(segments, _embedder(wav))


async def recheck_by_voice(segments: list[dict], audio_path: str | None) -> tuple[list, dict]:
    """Спикеры после сравнения голосов сомнительных реплик. Если проверить не удалось
    (нет аудио, ошибка модели) — спикеры Deepgram как есть."""
    current = [s.get("speaker_id") for s in segments]
    if not uncertain_speaker_indexes(segments):
        return current, {}
    if not audio_path:
        logger.warning("Voice recheck skipped: no audio path")
        return current, {}
    started = time.monotonic()
    try:
        ids, details = await asyncio.to_thread(_check, segments, audio_path)
    except Exception as e:
        logger.warning(f"Voice recheck failed, keeping Deepgram speakers: {e}", exc_info=True)
        return current, {}
    if "skipped" in details:
        logger.info(f"Voice recheck skipped: {details['skipped']}")
        return current, details
    voice = {i: d for i, d in details.items() if d[0] == "voice"}
    logger.info(
        f"Voice recheck: uncertain={len(details)}, by_voice={len(voice)}, undecided={len(details) - len(voice)}, "
        f"took={time.monotonic() - started:.1f}s "
        + " ".join(
            f"#{i}:{current[i]}->{ids[i]}({'/'.join(f'{v:.2f}' for v in sims.values())}{'' if kind == 'voice' else ',?'})"
            for i, (kind, sims) in sorted(details.items())
        )
    )
    return ids, details
