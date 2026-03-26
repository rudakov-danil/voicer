import io
from pydub import AudioSegment


def stitch_chunks(chunks: list[bytes]) -> bytes:
    """
    Склеивает список WAV-чанков в один файл.
    chunks должны быть отсортированы по chunk_index до передачи.
    Возвращает WAV-байты результирующего файла.
    """
    if not chunks:
        raise ValueError("No chunks to stitch")

    result = AudioSegment.empty()
    for chunk_data in chunks:
        segment = AudioSegment.from_wav(io.BytesIO(chunk_data))
        result += segment

    buf = io.BytesIO()
    result.export(buf, format="wav")
    return buf.getvalue()


def get_duration_ms(wav_bytes: bytes) -> int:
    """Возвращает длительность WAV-файла в миллисекундах."""
    segment = AudioSegment.from_wav(io.BytesIO(wav_bytes))
    return len(segment)
