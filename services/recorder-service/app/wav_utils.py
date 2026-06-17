"""Утилиты для работы с аудиофайлами звонков — без внешних зависимостей."""
import struct


def detect_wav_channels(audio_bytes: bytes) -> int | None:
    """Число каналов из заголовка WAV (RIFF). None — не WAV или заголовок битый."""
    if len(audio_bytes) < 24 or audio_bytes[:4] != b"RIFF" or audio_bytes[8:12] != b"WAVE":
        return None
    # Ищем chunk "fmt " — обычно сразу после WAVE, но бывают LIST/JUNK перед ним
    pos = 12
    while pos + 8 <= len(audio_bytes):
        chunk_id = audio_bytes[pos:pos + 4]
        chunk_size = struct.unpack("<I", audio_bytes[pos + 4:pos + 8])[0]
        if chunk_id == b"fmt " and pos + 12 <= len(audio_bytes):
            return struct.unpack("<H", audio_bytes[pos + 10:pos + 12])[0]
        pos += 8 + chunk_size + (chunk_size % 2)
    return None


def file_ext(filename: str | None) -> str:
    if filename and "." in filename:
        return "." + filename.rsplit(".", 1)[-1].lower()
    return ""
