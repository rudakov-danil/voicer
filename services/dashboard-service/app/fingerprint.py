"""«Отпечаток» разговора: кто когда говорил + метки событий на шкале времени.

Сегменты берутся из transcription.transcript_segments. Возражения, нарушения и
предложения допродажи хранятся цитатами без таймкода — их позицию находим,
сопоставляя цитату с репликами транскрипта по словам.
"""
import re

_WORD = re.compile(r"[0-9a-zа-я]+", re.IGNORECASE)

# Роли говорящего → дорожка: s — продавец (над осью), c — покупатель (под осью), u — не определён
_LANE = {"seller": "s", "customer": "c", "client": "c"}

# Соседние реплики одного человека с паузой меньше этой склеиваем — меньше прямоугольников
_MERGE_GAP_S = 0.4
# Минимальное совпадение слов цитаты с репликой, чтобы поставить метку
_MIN_MATCH = 0.6


def _tokens(text: str) -> list[str]:
    return [w for w in _WORD.findall((text or "").lower().replace("ё", "е")) if len(w) > 2]


def lanes(segments) -> list[list]:
    """[[начало_с, конец_с, 's'|'c'|'u'], ...] — склеенные по говорящему, с округлением."""
    out: list[list] = []
    for seg in segments:
        if seg.start_ms is None or seg.end_ms is None or seg.end_ms <= seg.start_ms:
            continue
        lane = _LANE.get((seg.speaker_role or "").lower(), "u")
        s, e = seg.start_ms / 1000, seg.end_ms / 1000
        if out and out[-1][2] == lane and s - out[-1][1] < _MERGE_GAP_S:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e, lane])
    return [[round(s, 1), round(e, 1), lane] for s, e, lane in out]


def talk_share(segs: list[list]) -> int | None:
    """Доля речи продавца, % (от речи продавца и покупателя)."""
    seller = sum(e - s for s, e, lane in segs if lane == "s")
    customer = sum(e - s for s, e, lane in segs if lane == "c")
    total = seller + customer
    return round(seller / total * 100) if total else None


def locate(quote: str, segments) -> float | None:
    """Секунда, где прозвучала цитата: реплика с наибольшим совпадением слов."""
    q = set(_tokens(quote))
    if not q:
        return None
    best_t, best_score = None, 0.0
    for seg in segments:
        if seg.start_ms is None:
            continue
        st = set(_tokens(seg.text))
        if not st:
            continue
        matched = len(q & st)
        if not matched:
            continue
        # Цитата бывает длиннее реплики (склейка нескольких) и короче её (фраза из монолога)
        score = matched / min(len(q), len(st)) if matched >= 3 or matched == len(q) else matched / len(q)
        if score > best_score:
            best_t, best_score = seg.start_ms / 1000, score
    return best_t if best_score >= _MIN_MATCH else None


def _offer_quotes(results) -> list[str]:
    """Цитаты предложений допродажи из upsell_results / crosssell_results."""
    quotes: list[str] = []
    if not isinstance(results, list):
        return quotes
    for rule in results:
        if not isinstance(rule, dict):
            continue
        offers = rule.get("offer_quotes") or {}
        if isinstance(offers, dict):
            for items in offers.values():
                if isinstance(items, list):
                    quotes.extend(q for q in items if isinstance(q, str))
    return quotes


def marks(duration: float, segments, objections, violations, upsell_results, crosssell_results) -> list[dict]:
    """Метки на шкале 0..1: crit / crit-mid — нарушение, warn / warn-ok — возражение
    (не отработано / отработано), ok — предложение допродажи."""
    if not duration:
        return []
    out: list[dict] = []

    def add(t: float | None, kind: str, label: str | None = None):
        if t is None:
            return
        pos = max(0.0, min(1.0, t / duration))
        # Две одинаковые метки почти в одной точке — оставляем одну
        if any(m["k"] == kind and abs(m["t"] - pos) < 0.015 for m in out):
            return
        out.append({"t": round(pos, 4), "k": kind, **({"label": label} if label else {})})

    for v in violations:
        kind = "crit" if (v.severity or "").lower() in ("high", "critical") else "crit-mid"
        add(locate(v.evidence or "", segments), kind, v.rule_title)
    for o in objections:
        add(locate(o.raw_text or "", segments), "warn-ok" if o.is_resolved else "warn", o.type)
    for q in _offer_quotes(upsell_results) + _offer_quotes(crosssell_results):
        add(locate(q, segments), "ok")

    out.sort(key=lambda m: m["t"])
    return out


def upsell_score(upsell_results, crosssell_results) -> tuple[int, int] | None:
    """Допродажа «предложено из положенного» по сработавшим правилам апсейла и кросс-сейла."""
    done = need = 0
    for results in (upsell_results, crosssell_results):
        if not isinstance(results, list):
            continue
        for rule in results:
            if not isinstance(rule, dict):
                continue
            required = rule.get("required_offers") or []
            offered = rule.get("offered_items") or []
            need += len(required)
            done += min(len(offered), len(required))
    return (done, need) if need else None
