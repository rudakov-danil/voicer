FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl ffmpeg && rm -rf /var/lib/apt/lists/*

# Голосовые отпечатки для проверки спикеров в diarize-worker (app/voice_check.py):
# torch для процессора и модель ECAPA в образе, чтобы при работе не ходить в интернет.
# Отдельными слоями до requirements.txt — не скачиваются заново при смене зависимостей.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.4.1 torchaudio==2.4.1 \
 && pip install --no-cache-dir speechbrain==1.0.2 huggingface_hub==0.25.2
ENV HF_HOME=/opt/hf
RUN python -c "from speechbrain.inference.speaker import EncoderClassifier; \
EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', savedir='/opt/ecapa')"
ENV HF_HUB_OFFLINE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
