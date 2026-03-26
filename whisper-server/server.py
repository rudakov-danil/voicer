import io
import logging
import time

import uvicorn
from faster_whisper import WhisperModel
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

MODEL_SIZE = "small"
logger.info(f"Loading Whisper model: {MODEL_SIZE}")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
logger.info("Whisper model loaded")


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("ru"),
    task: str = Form("transcribe"),
):
    t0 = time.time()
    audio_bytes = await file.read()
    audio_file = io.BytesIO(audio_bytes)

    segments_iter, info = model.transcribe(
        audio_file,
        language=language,
        task=task,
        beam_size=5,
        vad_filter=True,
    )

    segments = []
    full_text_parts = []
    for seg in segments_iter:
        segments.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
            "avg_logprob": seg.avg_logprob,
        })
        full_text_parts.append(seg.text.strip())

    full_text = " ".join(full_text_parts)
    logger.info(f"Transcribed {info.duration:.1f}s audio in {time.time()-t0:.1f}s, language={info.language}")

    return JSONResponse({
        "text": full_text,
        "language": info.language,
        "segments": segments,
    })


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
