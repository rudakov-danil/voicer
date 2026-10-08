"""Обёртки над ffmpeg/ffprobe: длительность, нормализация под ASR, нарезка историй."""
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class AudioError(RuntimeError):
    pass


async def _run(*cmd: str) -> bytes:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        tail = stderr.decode("utf-8", "replace").strip().splitlines()[-5:]
        raise AudioError(f"{cmd[0]} завершился с кодом {proc.returncode}: {' | '.join(tail)}")
    return stdout


async def probe_duration(path: Path) -> float:
    out = await _run(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    )
    try:
        return float(out.decode().strip())
    except ValueError as exc:
        raise AudioError(f"не удалось определить длительность {path.name}") from exc


async def to_wav_16k_mono(src: Path, dst: Path) -> Path:
    """Нормализует вход под ASR: 16 кГц, моно, PCM.

    Deepgram принимает и исходный контейнер, но после нормализации отпадают
    сюрпризы с экзотическими кодеками и VBR-таймингами, из-за которых
    таймкоды могут поехать относительно исходного файла.
    """
    await _run(
        "ffmpeg", "-nostdin", "-y", "-i", str(src),
        "-ac", "1", "-ar", "16000", "-vn", "-c:a", "pcm_s16le", str(dst),
    )
    return dst


async def cut(src: Path, dst: Path, start_sec: float, end_sec: float) -> Path:
    """Вырезает фрагмент в mp3.

    -ss ставится ПОСЛЕ -i: так ffmpeg режет точно по указанной секунде, а не по
    ближайшему ключевому кадру. Для нарезки историй точность важнее скорости.
    """
    duration = max(0.1, end_sec - start_sec)
    await _run(
        "ffmpeg", "-nostdin", "-y", "-i", str(src),
        "-ss", f"{start_sec:.3f}", "-t", f"{duration:.3f}",
        "-vn", "-c:a", "libmp3lame", "-q:a", "4", str(dst),
    )
    return dst
