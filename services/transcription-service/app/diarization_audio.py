"""
Audio-based speaker diarization using MFCC feature extraction + K-means clustering.
Roles: "seller" (worker/consultant) and "customer" — identified via LLM analysis
of the full labelled transcript (not just samples).
"""

import io
import logging
import numpy as np

logger = logging.getLogger(__name__)

MIN_SEGMENT_MS = 150
MAX_BLOCKS_FOR_LLM = 60   # max dialogue blocks (after merging consecutive same-speaker segments)


def _load_audio(audio_bytes: bytes) -> tuple:
    import librosa
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)
    return y, sr


def _extract_features(y: np.ndarray, sr: int, start_ms: int, end_ms: int):
    import librosa
    if (end_ms - start_ms) < MIN_SEGMENT_MS:
        return None
    start_sample = int(start_ms / 1000.0 * sr)
    end_sample = int(end_ms / 1000.0 * sr)
    segment = y[start_sample:end_sample]
    if len(segment) < sr * 0.1:
        return None
    mfcc = librosa.feature.mfcc(y=segment, sr=sr, n_mfcc=20)
    if mfcc.shape[1] < 2:
        return None
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)
    return np.concatenate([np.mean(mfcc, axis=1), np.mean(delta, axis=1), np.mean(delta2, axis=1)])


def _cluster_speakers(audio_bytes: bytes, segments: list[dict]) -> list[int] | None:
    """
    Returns cluster label (0 or 1) for each segment, or None on failure.
    K-means n=2: even if 3+ real speakers exist, they collapse into 2 voice groups.
    """
    try:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
    except ImportError:
        logger.error("scikit-learn not installed")
        return None

    try:
        y, sr = _load_audio(audio_bytes)
    except Exception as e:
        logger.error(f"Failed to load audio: {e}")
        return None

    valid_indices, valid_features = [], []
    for i, seg in enumerate(segments):
        feat = _extract_features(y, sr, seg.get("start_ms", 0), seg.get("end_ms", 0))
        if feat is not None:
            valid_indices.append(i)
            valid_features.append(feat)

    if len(valid_features) < 4:
        logger.warning(f"Only {len(valid_features)} valid segments for clustering")
        return None

    X = np.array(valid_features)
    X = StandardScaler().fit_transform(X)
    labels = KMeans(n_clusters=2, random_state=42, n_init=10).fit_predict(X)

    result = [-1] * len(segments)
    for i, label in zip(valid_indices, labels):
        result[i] = int(label)

    logger.info(
        f"Clustered {len(valid_features)}/{len(segments)} segments: "
        f"{sum(1 for l in result if l == 0)} in cluster-0, "
        f"{sum(1 for l in result if l == 1)} in cluster-1"
    )
    return result


def _build_labelled_transcript(
    segments: list[dict],
    cluster_labels: list[int],
    max_blocks: int = MAX_BLOCKS_FOR_LLM,
) -> str:
    """
    Merge consecutive segments from the same cluster into dialogue blocks:
      [A] Добрый день! Чем могу помочь?
      [B] Здравствуйте, хочу узнать про ноутбуки.
      [A] Конечно, для каких задач ищете?
      ...
    Segments with label -1 (no audio feature) inherit the previous speaker label.
    If there are more blocks than max_blocks, downsample evenly.
    """
    # Step 1: assign speaker label to every segment, carrying forward last known
    labelled_segs = []
    last_label = 0
    for seg, label in zip(segments, cluster_labels):
        if label != -1:
            last_label = label
        labelled_segs.append(("A" if last_label == 0 else "B", seg["text"].strip()))

    # Step 2: merge consecutive segments with the same speaker into blocks
    blocks: list[list] = []
    for speaker, text in labelled_segs:
        if not text:
            continue
        if blocks and blocks[-1][0] == speaker:
            blocks[-1][1] += " " + text
        else:
            blocks.append([speaker, text])

    # Step 3: downsample blocks if too many
    if len(blocks) > max_blocks:
        step = len(blocks) / max_blocks
        blocks = [blocks[int(j * step)] for j in range(max_blocks)]

    logger.info(f"Transcript: {len(labelled_segs)} segments -> {len(blocks)} dialogue blocks")
    return "\n".join(f"[{spk}] {txt}" for spk, txt in blocks)


async def _identify_seller_cluster(
    segments: list[dict],
    cluster_labels: list[int],
    seller_name: str,
) -> int:
    """
    Show LLM the full labelled transcript ([A]/[B] per block) and ask who is the worker.
    Uses dedicated fast LLM (OpenRouter) via AUDIO_LLM_* settings.
    Returns 0 (cluster-0 = seller) or 1 (cluster-1 = seller).
    """
    transcript = _build_labelled_transcript(segments, cluster_labels)

    prompt = f"""Перед тобой транскрипт разговора. Каждая реплика помечена спикером [A] или [B].
Один из них — РАБОТНИК (продавец, консультант, менеджер, администратор).
Другой — КЛИЕНТ (покупатель, посетитель, клиент).

Имя работника: {seller_name}

ТРАНСКРИПТ:
{transcript}

Проанализируй ВЕСЬ смысл диалога целиком:
- Кто управляет ходом разговора, задаёт его структуру и направление?
- Кто инициирует темы, переключает их, подводит итоги?
- Кто отвечает на вопросы другого, а кто их задаёт?
- Как меняется тон и роль каждого участника по ходу разговора?
- Кто в итоге принимает решение, а кто его предлагает?

Признаки РАБОТНИКА:
- Говорит с позиции эксперта: объясняет, консультирует, рекомендует
- Предлагает товары/услуги, называет цены, характеристики, преимущества
- Задаёт уточняющие вопросы чтобы понять потребность клиента
- Ведёт разговор по структуре: приветствие -> выявление потребности -> предложение -> закрытие
- Работает с возражениями, предлагает альтернативы, управляет ситуацией

Признаки КЛИЕНТА:
- Описывает свою потребность, запрос или проблему
- Реагирует на предложения: уточняет, сомневается, возражает
- Принимает или откладывает решение
- Следует за структурой разговора, которую задаёт работник

Ответь ОДНИМ словом — только буква: A или B (кто является РАБОТНИКОМ)."""

    try:
        from app.config import settings
        from openai import AsyncOpenAI

        audio_client = AsyncOpenAI(
            base_url=settings.AUDIO_LLM_SERVER_URL,
            api_key=settings.AUDIO_LLM_API_KEY,
        )
        extra_headers = {}
        if settings.LLM_EXTRA_HEADER_NAME:
            extra_headers[settings.LLM_EXTRA_HEADER_NAME] = settings.LLM_EXTRA_HEADER_VALUE

        response = await audio_client.chat.completions.create(
            model=settings.AUDIO_LLM_MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=5,
            timeout=30,
            extra_headers=extra_headers or None,
        )
        raw = (response.choices[0].message.content or "").strip().upper()
        logger.info(f"LLM worker identification response: {repr(raw)}")
        if "A" in raw and "B" not in raw:
            return 0
        if "B" in raw and "A" not in raw:
            return 1
        logger.warning(f"Unclear LLM response '{raw}', using first-speaker heuristic")
    except Exception as e:
        logger.warning(f"LLM worker identification failed: {e}, using first-speaker heuristic")

    # Heuristic fallback: cluster of the very first labelled segment = worker
    for label in cluster_labels:
        if label != -1:
            return label
    return 0


async def diarize_audio(
    audio_bytes: bytes,
    segments: list[dict],
    seller_name: str,
    llm_client,           # kept for API compatibility, not used directly here
) -> list[str]:
    """
    Returns list of "seller" | "customer" | "unknown" for each segment.
    Pipeline: MFCC clustering -> labelled transcript (merged blocks) -> LLM identifies worker cluster.
    """
    if not segments:
        return []

    cluster_labels = _cluster_speakers(audio_bytes, segments)
    if cluster_labels is None:
        logger.warning("Clustering failed, returning all unknown")
        return ["unknown"] * len(segments)

    seller_cluster = await _identify_seller_cluster(segments, cluster_labels, seller_name)
    logger.info(f"Worker cluster identified as: {seller_cluster}")

    roles = []
    for label in cluster_labels:
        if label == -1:
            roles.append("unknown")
        elif label == seller_cluster:
            roles.append("seller")
        else:
            roles.append("customer")

    logger.info(
        f"Audio diarization complete: {roles.count('seller')} seller, "
        f"{roles.count('customer')} customer, {roles.count('unknown')} unknown"
    )
    return roles
