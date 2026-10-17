"""Клиники (industry = 'clinic'): приёмы, протоколы, качество работы врачей и сигналы фрода.

Данные — из анализа приёма (analytics-engine, миграция 0014):
  analytics.clinic_visits   — баллы сервиса и компетентности, число нарушений и сигналов фрода
  analytics.visit_checks    — результат каждого правила контроля с цитатой
  analytics.visit_protocols — протокол приёма: черновик ИИ и версия врача (ключ — запись)
  analytics.quality_rules   — правила контроля клиники; при первом обращении копируются из пресета
  analytics.clinic_doctors  — специальность врача

Определения (одни на всех экранах):
  Сервис, Компетентность — доля выполненных правил «должно быть» своей группы: выполнено = 1,
    частично = ½, не выполнено = 0; «не применимо» не входит. Среднее по приёмам.
  Нарушения — сработавшие запреты сервиса и компетентности; сигналы фрода — запреты группы «Фрод».
  Протокол подтверждён — врач проверил черновик ИИ и подтвердил его в приложении.
"""
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_mobile_user
from app.org_settings import org_tz
from app.routers.upsell import _allowed_stores, _check_store, _seller_or_404

router = APIRouter(prefix="/api/v1/dashboard/clinic", tags=["clinic"])

# Те же разделы и подписи, что в analytics-engine (app/clinic.py) и мобильном приложении
PROTOCOL_FIELDS = [
    ("patient", "Пациент"),
    ("complaints", "Жалобы"),
    ("anamnesis", "Анамнез заболевания"),
    ("life_anamnesis", "Анамнез жизни"),
    ("allergies", "Аллергологический анамнез"),
    ("medications", "Принимает препараты"),
    ("examination", "Объективно"),
    ("diagnosis", "Диагноз"),
    ("icd10", "Код МКБ-10"),
    ("tests", "Обследования"),
    ("treatment", "Назначения"),
    ("recommendations", "Рекомендации"),
    ("sick_leave", "Больничный лист, справка"),
    ("follow_up", "Повторный приём"),
]
PROTOCOL_KEYS = [k for k, _ in PROTOCOL_FIELDS]
MAX_FIELD_CHARS = 4000
# «Низкое качество» в подборке: сервис или компетентность приёма ниже этого балла — выполнено меньше половины правил
LOW_SCORE = 50
DEMO_SLUG = "medicine-demo"

CATEGORIES = ("service", "competence", "fraud")
KINDS = ("required", "forbidden")
SEVERITIES = ("low", "medium", "high")
MAX_RULES = 60


def _f(v) -> float | None:
    return round(float(v), 4) if v is not None else None


def _share(score) -> float | None:
    """Балл 0..100 → доля 0..1 (в кабинете доли показываются процентами)."""
    return round(float(score) / 100, 4) if score is not None else None


def _name(first, last) -> str:
    return f"{first or ''} {last or ''}".strip()


async def _today(db: AsyncSession, org_id: uuid.UUID) -> date:
    return datetime.now(ZoneInfo(await org_tz(db, org_id))).date()


async def _range(db: AsyncSession, org_id: uuid.UUID, date_from: date | None, date_to: date | None) -> tuple[date, date]:
    to = date_to or await _today(db, org_id)
    return date_from or to - timedelta(days=29), to


def _scope(user: dict, store_id: uuid.UUID | None, seller_id: uuid.UUID | None = None, alias: str = "c") -> tuple[str, dict]:
    """Условия доступа и фильтров по разговорам: организация, точка, врач, роль."""
    conds = [f"{alias}.organization_id = :org"]
    params: dict = {"org": uuid.UUID(user["organization_id"])}
    if store_id:
        _check_store(user, store_id)
        conds.append(f"{alias}.store_id = :store")
        params["store"] = store_id
    allowed = _allowed_stores(user)
    if allowed is not None:
        conds.append(f"{alias}.store_id = ANY(:allowed)")
        params["allowed"] = [uuid.UUID(s) for s in allowed]
    if seller_id:
        conds.append(f"{alias}.seller_id = :seller")
        params["seller"] = seller_id
    return " AND ".join(conds), params


# Приёмы периода: одна выборка для всех сводок
_VISITS_CTE = """
    WITH v AS (
        SELECT c.id, c.recording_id, c.seller_id, c.store_id, c.session_date, c.topic,
               COALESCE(r.started_at, c.analyzed_at) AS at, r.duration_seconds AS dur,
               cv.is_visit, cv.service_score, cv.competence_score, cv.fraud_signals, cv.issue_signals,
               cv.checks_done, vp.status AS protocol_status
        FROM analytics.conversations c
        JOIN analytics.clinic_visits cv ON cv.conversation_id = c.id
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN analytics.visit_protocols vp ON vp.recording_id = c.recording_id
        WHERE {where} AND c.session_date BETWEEN :df AND :dt
    )
"""

_TOTALS = """
    COUNT(*) FILTER (WHERE v.is_visit) AS visits,
    COUNT(*) FILTER (WHERE NOT v.is_visit) AS non_visits,
    AVG(v.dur) FILTER (WHERE v.is_visit) AS avg_dur,
    AVG(v.service_score) FILTER (WHERE v.is_visit) AS service,
    COUNT(v.service_score) FILTER (WHERE v.is_visit) AS service_n,
    AVG(v.competence_score) FILTER (WHERE v.is_visit) AS competence,
    COUNT(v.competence_score) FILTER (WHERE v.is_visit) AS competence_n,
    COALESCE(SUM(v.fraud_signals) FILTER (WHERE v.is_visit), 0) AS fraud_signals,
    COUNT(*) FILTER (WHERE v.is_visit AND v.fraud_signals > 0) AS fraud_visits,
    COALESCE(SUM(v.issue_signals) FILTER (WHERE v.is_visit), 0) AS issue_signals,
    COUNT(*) FILTER (WHERE v.is_visit AND v.issue_signals > 0) AS issue_visits,
    COUNT(*) FILTER (WHERE v.is_visit AND v.protocol_status IN ('draft', 'confirmed')) AS protocols,
    COUNT(*) FILTER (WHERE v.is_visit AND v.protocol_status = 'confirmed') AS confirmed
"""


def _totals(r) -> dict:
    return {
        "visits": int(r.visits or 0),
        "non_visits": int(r.non_visits or 0),
        "avg_duration_sec": round(float(r.avg_dur)) if r.avg_dur is not None else None,
        "service": _share(r.service),
        "service_visits": int(r.service_n or 0),
        "competence": _share(r.competence),
        "competence_visits": int(r.competence_n or 0),
        "fraud_signals": int(r.fraud_signals or 0),
        "fraud_visits": int(r.fraud_visits or 0),
        "issue_signals": int(r.issue_signals or 0),
        "issue_visits": int(r.issue_visits or 0),
        "protocols": int(r.protocols or 0),
        "protocols_confirmed": int(r.confirmed or 0),
    }


async def _criteria(db: AsyncSession, where: str, params: dict) -> list[dict]:
    """Правила «должно быть»: как часто выполняются. Слабые — первыми."""
    rows = (await db.execute(text(_VISITS_CTE.format(where=where) + """
        SELECT vc.rule_id, COALESCE(MAX(qr.title), MAX(vc.title)) AS title, MAX(vc.category) AS category,
               MIN(qr.sort_order) AS sort_order,
               COUNT(*) FILTER (WHERE vc.status = 'met') AS met,
               COUNT(*) FILTER (WHERE vc.status = 'partial') AS partial,
               COUNT(*) FILTER (WHERE vc.status = 'missed') AS missed,
               COUNT(*) FILTER (WHERE vc.status = 'na') AS na
        FROM analytics.visit_checks vc
        JOIN v ON v.id = vc.conversation_id AND v.is_visit
        LEFT JOIN analytics.quality_rules qr ON qr.id = vc.rule_id
        WHERE vc.kind = 'required'
        GROUP BY vc.rule_id
    """), params)).fetchall()
    out = []
    for r in rows:
        applicable = r.met + r.partial + r.missed
        out.append({
            "rule_id": str(r.rule_id) if r.rule_id else None, "title": r.title, "category": r.category,
            "met": r.met, "partial": r.partial, "missed": r.missed, "na": r.na, "applicable": applicable,
            "rate": round((r.met + 0.5 * r.partial) / applicable, 4) if applicable else None,
            "sort_order": r.sort_order if r.sort_order is not None else 999,
        })
    return sorted(out, key=lambda x: (x["rate"] if x["rate"] is not None else 2, x["sort_order"]))


async def _signals(db: AsyncSession, where: str, params: dict) -> list[dict]:
    """Сработавшие запреты по правилам: сколько раз, на скольких приёмах, у каких врачей."""
    rows = (await db.execute(text(_VISITS_CTE.format(where=where) + """
        SELECT vc.rule_id, v.seller_id, s.first_name, s.last_name,
               COALESCE(MAX(qr.title), MAX(vc.title)) AS title, MAX(vc.category) AS category,
               MAX(vc.severity) AS severity, COUNT(*) AS n, COUNT(DISTINCT vc.conversation_id) AS visits
        FROM analytics.visit_checks vc
        JOIN v ON v.id = vc.conversation_id AND v.is_visit
        LEFT JOIN admin_schema.sellers s ON s.id = v.seller_id
        LEFT JOIN analytics.quality_rules qr ON qr.id = vc.rule_id
        WHERE vc.kind = 'forbidden'
        GROUP BY vc.rule_id, v.seller_id, s.first_name, s.last_name
    """), params)).fetchall()
    by_rule: dict = {}
    for r in rows:
        key = str(r.rule_id)
        item = by_rule.setdefault(key, {"rule_id": key, "title": r.title, "category": r.category,
                                        "severity": r.severity, "count": 0, "visits": 0, "doctors": []})
        item["count"] += r.n
        item["visits"] += r.visits
        item["doctors"].append({"seller_id": str(r.seller_id), "name": _name(r.first_name, r.last_name), "count": r.n})
    for item in by_rule.values():
        item["doctors"].sort(key=lambda d: -d["count"])
    order = {"fraud": 0, "service": 1, "competence": 2}
    return sorted(by_rule.values(), key=lambda x: (order.get(x["category"], 3), -x["count"]))


async def _weeks(db: AsyncSession, where: str, params: dict) -> list[dict]:
    rows = (await db.execute(text(_VISITS_CTE.format(where=where) + """
        SELECT date_trunc('week', v.session_date)::date AS week,
               COUNT(*) FILTER (WHERE v.is_visit) AS visits,
               AVG(v.service_score) FILTER (WHERE v.is_visit) AS service,
               AVG(v.competence_score) FILTER (WHERE v.is_visit) AS competence,
               COALESCE(SUM(v.fraud_signals) FILTER (WHERE v.is_visit), 0) AS fraud_signals,
               COALESCE(SUM(v.issue_signals) FILTER (WHERE v.is_visit), 0) AS issue_signals
        FROM v GROUP BY 1 ORDER BY 1
    """), params)).fetchall()
    return [{"week": str(r.week), "visits": r.visits, "service": _share(r.service),
             "competence": _share(r.competence), "fraud_signals": int(r.fraud_signals),
             "issue_signals": int(r.issue_signals)} for r in rows]


async def _attention(db: AsyncSession, where: str, params: dict, tz: str, limit: int = 12) -> list[dict]:
    """Очередь на разбор: свежие сработавшие запреты — сначала серьёзные."""
    rows = (await db.execute(text(_VISITS_CTE.format(where=where) + """
        SELECT vc.conversation_id, vc.title, vc.category, vc.severity, vc.quote, vc.comment,
               v.seller_id, v.topic, v.at, s.first_name, s.last_name, st.name AS store_name,
               to_char(v.at AT TIME ZONE :tz, 'DD.MM HH24:MI') AS when_local
        FROM analytics.visit_checks vc
        JOIN v ON v.id = vc.conversation_id AND v.is_visit
        LEFT JOIN admin_schema.sellers s ON s.id = v.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = v.store_id
        WHERE vc.kind = 'forbidden'
        ORDER BY CASE vc.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, v.at DESC
        LIMIT :limit
    """), {**params, "tz": tz, "limit": limit})).fetchall()
    return [{"conversation_id": str(r.conversation_id), "title": r.title, "category": r.category,
             "severity": r.severity, "quote": r.quote, "comment": r.comment, "seller_id": str(r.seller_id),
             "seller_name": _name(r.first_name, r.last_name), "store_name": r.store_name,
             "reason": r.topic, "at": r.at.isoformat() if r.at else None, "when": r.when_local} for r in rows]


async def _doctors(db: AsyncSession, user: dict, where: str, params: dict, store_id: uuid.UUID | None) -> list[dict]:
    """Все активные врачи доступных клиник — и те, у кого за период не было приёмов."""
    s_conds = ["s.organization_id = :org", "s.is_active"]
    if store_id:
        s_conds.append("s.store_id = :store")
    if "allowed" in params:
        s_conds.append("s.store_id = ANY(:allowed)")
    rows = (await db.execute(text(_VISITS_CTE.format(where=where) + f"""
        , agg AS (SELECT v.seller_id AS agg_seller, {_TOTALS} FROM v GROUP BY v.seller_id)
        SELECT s.id AS doctor_id, s.first_name, s.last_name, st.name AS store_name, d.specialty, agg.*
        FROM admin_schema.sellers s
        LEFT JOIN admin_schema.stores st ON st.id = s.store_id
        LEFT JOIN analytics.clinic_doctors d ON d.seller_id = s.id
        LEFT JOIN agg ON agg.agg_seller = s.id
        WHERE {' AND '.join(s_conds)}
        ORDER BY agg.visits DESC NULLS LAST, s.last_name
    """), params)).fetchall()
    return [{"seller_id": str(r.doctor_id), "name": _name(r.first_name, r.last_name), "store_name": r.store_name,
             "specialty": r.specialty, **_totals(r)} for r in rows]


@router.get("/overview")
async def clinic_overview(
    store_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = uuid.UUID(user["organization_id"])
    df, dt = await _range(db, org_id, date_from, date_to)
    where, params = _scope(user, store_id)
    params.update(df=df, dt=dt)
    totals = (await db.execute(text(_VISITS_CTE.format(where=where) + f"SELECT {_TOTALS} FROM v"), params)).fetchone()
    tz = await org_tz(db, org_id)
    return {
        "period": {"date_from": str(df), "date_to": str(dt)},
        "low_score": LOW_SCORE,
        "totals": _totals(totals),
        "doctors": await _doctors(db, user, where, params, store_id),
        "criteria": await _criteria(db, where, params),
        "signals": await _signals(db, where, params),
        "weeks": await _weeks(db, where, params),
        "attention": await _attention(db, where, params, tz),
    }


VIEWS = {
    "all": "TRUE",
    "fraud": "cv.fraud_signals > 0",
    "issues": "cv.issue_signals > 0",
    "low": f"cv.is_visit AND (cv.service_score < {LOW_SCORE} OR cv.competence_score < {LOW_SCORE})",
    "draft": "cv.is_visit AND vp.status = 'draft'",
    "non_visit": "NOT cv.is_visit",
}


@router.get("/visits")
async def clinic_visits(
    store_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    view: str = "all",
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    with_counts: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = uuid.UUID(user["organization_id"])
    df, dt = await _range(db, org_id, date_from, date_to)
    where, params = _scope(user, store_id, seller_id)
    params.update(df=df, dt=dt, tz=await org_tz(db, org_id))
    base = f"""
        FROM analytics.conversations c
        JOIN analytics.clinic_visits cv ON cv.conversation_id = c.id
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        LEFT JOIN analytics.visit_protocols vp ON vp.recording_id = c.recording_id
        WHERE {where} AND c.session_date BETWEEN :df AND :dt
    """
    search = ""
    if q and q.strip():
        search = """ AND (c.topic ILIKE :q OR s.last_name ILIKE :q OR s.first_name ILIKE :q
                         OR COALESCE(vp.final, vp.draft)->>'diagnosis' ILIKE :q)"""
        params["q"] = f"%{q.strip()}%"
    cond = VIEWS.get(view, "TRUE")
    total = (await db.execute(text(f"SELECT COUNT(*) {base} {search} AND {cond}"), params)).scalar() or 0
    rows = (await db.execute(text(f"""
        SELECT c.id, c.recording_id, c.seller_id, c.store_id, c.session_date, c.topic,
               COALESCE(r.started_at, c.analyzed_at) AS at, r.duration_seconds,
               to_char(COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz, 'HH24:MI') AS hhmm,
               s.first_name, s.last_name, st.name AS store_name,
               cv.is_visit, cv.service_score, cv.competence_score, cv.fraud_signals, cv.issue_signals,
               cv.note, cv.checks_done, vp.status AS protocol_status,
               COALESCE(vp.final, vp.draft)->>'diagnosis' AS diagnosis,
               (SELECT json_agg(json_build_object('title', vc.title, 'category', vc.category, 'severity', vc.severity)
                                ORDER BY vc.sort_order)
                FROM analytics.visit_checks vc WHERE vc.conversation_id = c.id AND vc.kind = 'forbidden') AS signals
        {base} {search} AND {cond}
        ORDER BY at DESC
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset})).fetchall()
    out = {
        "total": int(total),
        "items": [{
            "conversation_id": str(r.id), "recording_id": str(r.recording_id), "seller_id": str(r.seller_id),
            "seller_name": _name(r.first_name, r.last_name), "store_name": r.store_name,
            "session_date": str(r.session_date), "at": r.at.isoformat() if r.at else None, "time": r.hhmm,
            "duration_sec": r.duration_seconds, "reason": r.topic, "diagnosis": r.diagnosis,
            "is_visit": r.is_visit, "service": _share(r.service_score), "competence": _share(r.competence_score),
            "fraud_signals": r.fraud_signals, "issue_signals": r.issue_signals, "note": r.note,
            "checks_done": r.checks_done, "protocol_status": r.protocol_status, "signals": r.signals or [],
        } for r in rows],
    }
    if with_counts:
        counts = (await db.execute(text(f"""
            SELECT COUNT(*) AS "all", {', '.join(f"COUNT(*) FILTER (WHERE {c}) AS {k}" for k, c in VIEWS.items() if k != 'all')}
            {base} {search}
        """), params)).fetchone()
        out["counts"] = dict(counts._mapping)
    return out


async def _transcript(db: AsyncSession, recording_id) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT ts.speaker_role, ts.text, ts.start_ms, ts.end_ms
        FROM transcription.transcripts t
        JOIN transcription.transcript_segments ts ON ts.transcript_id = t.id
        WHERE t.recording_id = :rec
        ORDER BY ts.segment_index
    """), {"rec": recording_id})).fetchall()
    return [dict(r._mapping) for r in rows]


def _protocol_out(row) -> dict | None:
    if row is None:
        return None
    return {
        "status": row.status, "draft": row.draft, "final": row.final,
        "confirmed_at": row.confirmed_at.isoformat() if row.confirmed_at else None,
        "confirmed_by_name": row.confirmed_by_name,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
    }


@router.get("/visits/{conversation_id}")
async def clinic_visit(
    conversation_id: uuid.UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    where, params = _scope(user, None)
    params["id"] = conversation_id
    org_id = uuid.UUID(user["organization_id"])
    params["tz"] = await org_tz(db, org_id)
    r = (await db.execute(text(f"""
        SELECT c.id, c.recording_id, c.seller_id, c.store_id, c.session_date, c.topic, c.analyzed_at,
               c.talk_ratio, c.interruptions_count, c.longest_monologue_seconds, c.silence_ratio,
               COALESCE(r.started_at, c.analyzed_at) AS at, r.duration_seconds, r.source,
               to_char(COALESCE(r.started_at, c.analyzed_at) AT TIME ZONE :tz, 'DD.MM.YYYY HH24:MI') AS when_local,
               s.first_name, s.last_name, st.name AS store_name, d.specialty,
               cv.is_visit, cv.visit_type, cv.service_score, cv.competence_score, cv.fraud_signals,
               cv.issue_signals, cv.note, cv.checks_done
        FROM analytics.conversations c
        JOIN analytics.clinic_visits cv ON cv.conversation_id = c.id
        LEFT JOIN recorder.recordings r ON r.id = c.recording_id
        LEFT JOIN admin_schema.sellers s ON s.id = c.seller_id
        LEFT JOIN admin_schema.stores st ON st.id = c.store_id
        LEFT JOIN analytics.clinic_doctors d ON d.seller_id = c.seller_id
        WHERE {where} AND c.id = :id
    """), params)).fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Приём не найден")
    protocol = (await db.execute(text("""
        SELECT status, draft, final, confirmed_at, confirmed_by_name, generated_at
        FROM analytics.visit_protocols WHERE recording_id = :rec
    """), {"rec": r.recording_id})).fetchone()
    checks = (await db.execute(text("""
        SELECT rule_id, code, category, kind, title, severity, status, quote, comment
        FROM analytics.visit_checks WHERE conversation_id = :id ORDER BY sort_order
    """), {"id": conversation_id})).fetchall()
    return {
        "fields": PROTOCOL_FIELDS,
        "visit": {
            "conversation_id": str(r.id), "recording_id": str(r.recording_id), "seller_id": str(r.seller_id),
            "seller_name": _name(r.first_name, r.last_name), "specialty": r.specialty,
            "store_id": str(r.store_id), "store_name": r.store_name, "session_date": str(r.session_date),
            "at": r.at.isoformat() if r.at else None, "when": r.when_local, "duration_sec": r.duration_seconds,
            "source": r.source, "reason": r.topic, "is_visit": r.is_visit, "visit_type": r.visit_type,
            "service": _share(r.service_score), "competence": _share(r.competence_score),
            "fraud_signals": r.fraud_signals, "issue_signals": r.issue_signals, "note": r.note,
            "checks_done": r.checks_done, "talk_ratio": _f(r.talk_ratio),
            "interruptions_count": r.interruptions_count, "longest_monologue_seconds": r.longest_monologue_seconds,
        },
        "protocol": _protocol_out(protocol),
        "checks": [{**dict(c._mapping), "rule_id": str(c.rule_id) if c.rule_id else None}
                   for c in checks if c.kind == "required"],
        "violations": [{**dict(c._mapping), "rule_id": str(c.rule_id) if c.rule_id else None}
                       for c in checks if c.kind == "forbidden"],
        "segments": await _transcript(db, r.recording_id),
    }


@router.get("/doctors/{seller_id}")
async def clinic_doctor(
    seller_id: uuid.UUID,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seller = await _seller_or_404(db, user, seller_id)
    org_id = uuid.UUID(user["organization_id"])
    df, dt = await _range(db, org_id, date_from, date_to)
    where, params = _scope(user, None, seller_id)
    params.update(df=df, dt=dt)
    totals = (await db.execute(text(_VISITS_CTE.format(where=where) + f"SELECT {_TOTALS} FROM v"), params)).fetchone()
    # Сравнение с клиникой врача: те же правила по всем врачам этой клиники
    team_where, team_params = _scope(user, seller.store_id)
    team_params.update(df=df, dt=dt)
    team = {c["rule_id"]: c for c in await _criteria(db, team_where, team_params)}
    criteria = await _criteria(db, where, params)
    for c in criteria:
        c["team_rate"] = (team.get(c["rule_id"]) or {}).get("rate")
    signals = (await db.execute(text(_VISITS_CTE.format(where=where) + """
        SELECT vc.conversation_id, vc.title, vc.category, vc.severity, vc.quote, vc.comment, v.topic, v.at,
               to_char(v.at AT TIME ZONE :tz, 'DD.MM HH24:MI') AS when_local
        FROM analytics.visit_checks vc JOIN v ON v.id = vc.conversation_id AND v.is_visit
        WHERE vc.kind = 'forbidden'
        ORDER BY v.at DESC LIMIT 30
    """), {**params, "tz": await org_tz(db, org_id)})).fetchall()
    specialty = (await db.execute(text("SELECT specialty FROM analytics.clinic_doctors WHERE seller_id = :id"),
                                  {"id": seller_id})).scalar()
    return {
        "period": {"date_from": str(df), "date_to": str(dt)},
        "doctor": {"seller_id": str(seller.id), "name": _name(seller.first_name, seller.last_name),
                   "store_id": str(seller.store_id), "store_name": seller.store_name, "specialty": specialty},
        "totals": _totals(totals),
        "team": _totals((await db.execute(text(_VISITS_CTE.format(where=team_where) + f"SELECT {_TOTALS} FROM v"),
                                          team_params)).fetchone()),
        "criteria": criteria,
        "weeks": await _weeks(db, where, params),
        "signals": [{"conversation_id": str(s.conversation_id), "title": s.title, "category": s.category,
                     "severity": s.severity, "quote": s.quote, "comment": s.comment, "reason": s.topic,
                     "when": s.when_local} for s in signals],
    }


class DoctorUpdate(BaseModel):
    specialty: str | None = Field(None, max_length=100)


@router.put("/doctors/{seller_id}")
async def update_doctor(
    seller_id: uuid.UUID,
    body: DoctorUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.get("role") not in ("director", "admin", "manager", "rop"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    await _seller_or_404(db, user, seller_id)
    specialty = (body.specialty or "").strip() or None
    await db.execute(text("""
        INSERT INTO analytics.clinic_doctors (seller_id, organization_id, specialty, updated_at)
        VALUES (:id, :org, :specialty, now())
        ON CONFLICT (seller_id) DO UPDATE SET specialty = EXCLUDED.specialty, updated_at = now()
    """), {"id": seller_id, "org": uuid.UUID(user["organization_id"]), "specialty": specialty})
    await db.commit()
    return {"seller_id": str(seller_id), "specialty": specialty}


# ─── Правила контроля ────────────────────────────────────────────────────────

async def _ensure_rules(db: AsyncSession, org_id: uuid.UUID) -> None:
    """Как analytics-engine (app/clinic.py: ensure_rules): у новой клиники — копия пресета."""
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('quality_rules:' || CAST(:org AS text)))"), {"org": str(org_id)})
    await db.execute(text("""
        INSERT INTO analytics.quality_rules (organization_id, code, category, kind, title, description, severity, sort_order)
        SELECT :org, p.code, p.category, p.kind, p.title, p.description, p.severity, p.sort_order
        FROM analytics.quality_rule_presets p
        WHERE p.industry = 'clinic'
          AND NOT EXISTS (SELECT 1 FROM analytics.quality_rules r WHERE r.organization_id = :org)
    """), {"org": org_id})
    await db.commit()


async def _rules(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT id, code, category, kind, title, description, severity, is_active, sort_order, updated_at
        FROM analytics.quality_rules WHERE organization_id = :org ORDER BY sort_order, created_at
    """), {"org": org_id})).fetchall()
    return [{**dict(r._mapping), "id": str(r.id), "updated_at": r.updated_at.isoformat()} for r in rows]


@router.get("/rules")
async def get_rules(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = uuid.UUID(user["organization_id"])
    await _ensure_rules(db, org_id)
    return {"items": await _rules(db, org_id), "can_edit": user.get("role") in ("director", "admin")}


class RuleIn(BaseModel):
    id: uuid.UUID | None = None
    category: str
    kind: str
    title: str = Field(min_length=1, max_length=255)
    description: str = Field("", max_length=2000)
    severity: str = "medium"
    is_active: bool = True


class RulesIn(BaseModel):
    items: list[RuleIn] = Field(max_length=MAX_RULES)


@router.put("/rules")
async def put_rules(body: RulesIn, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Сохраняет набор правил целиком: изменённые обновляются, новые добавляются, убранные удаляются.
    История приёмов не пересчитывается — у проверок свой снимок названия правила."""
    if user.get("role") not in ("director", "admin"):
        raise HTTPException(status_code=403, detail="Правила меняют директор и администратор")
    org_id = uuid.UUID(user["organization_id"])
    for r in body.items:
        if r.category not in CATEGORIES or r.kind not in KINDS or r.severity not in SEVERITIES:
            raise HTTPException(status_code=422, detail=f"Неизвестная группа, вид или важность правила «{r.title}»")
        if r.category == "fraud" and r.kind != "forbidden":
            raise HTTPException(status_code=422, detail=f"Правило фрода описывает то, чего не должно быть: «{r.title}»")
    await _ensure_rules(db, org_id)
    existing = {str(x["id"]) for x in await _rules(db, org_id)}
    keep = {str(r.id) for r in body.items if r.id and str(r.id) in existing}
    if existing - keep:
        await db.execute(text("DELETE FROM analytics.quality_rules WHERE organization_id = :org AND id = ANY(:ids)"),
                         {"org": org_id, "ids": [uuid.UUID(i) for i in existing - keep]})
    for i, r in enumerate(body.items):
        values = {"org": org_id, "category": r.category, "kind": r.kind, "title": r.title.strip(),
                  "description": r.description.strip(), "severity": r.severity, "active": r.is_active,
                  "sort": i, "by": uuid.UUID(user["sub"])}
        if r.id and str(r.id) in keep:
            await db.execute(text("""
                UPDATE analytics.quality_rules SET category = :category, kind = :kind, title = :title,
                    description = :description, severity = :severity, is_active = :active, sort_order = :sort,
                    updated_by = :by, updated_at = now()
                WHERE id = :id AND organization_id = :org
            """), {**values, "id": r.id})
        else:
            await db.execute(text("""
                INSERT INTO analytics.quality_rules
                    (organization_id, category, kind, title, description, severity, is_active, sort_order, updated_by)
                VALUES (:org, :category, :kind, :title, :description, :severity, :active, :sort, :by)
            """), values)
    await db.commit()
    return {"items": await _rules(db, org_id), "can_edit": True}


# ─── Протоколы врача (мобильное приложение и кабинет) ────────────────────────

def _clean_protocol(raw: dict) -> dict:
    out = {}
    for k in PROTOCOL_KEYS:
        v = raw.get(k)
        s = str(v).strip() if v is not None else ""
        out[k] = s[:MAX_FIELD_CHARS] or None
    return out


async def _doctor_view(db: AsyncSession, user: dict, seller_id: uuid.UUID):
    seller = await _seller_or_404(db, user, seller_id)
    if user.get("role") != "employee" and user.get("role") not in ("director", "admin", "manager", "rop"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return seller


@router.get("/doctors/{seller_id}/protocols")
async def doctor_protocols(
    seller_id: uuid.UUID,
    day: date | None = None,
    user: dict = Depends(get_mobile_user),
    db: AsyncSession = Depends(get_db),
):
    """Приёмы врача за день с протоколами — свежие сверху. Запись, которую ещё разбирают,
    тоже в списке: врач видит, что протокол скоро появится."""
    seller = await _doctor_view(db, user, seller_id)
    org_id = uuid.UUID(user["organization_id"])
    tz = await org_tz(db, org_id)
    day = day or datetime.now(ZoneInfo(tz)).date()
    rows = (await db.execute(text("""
        SELECT r.id AS recording_id, r.status AS rec_status, r.duration_seconds,
               COALESCE(r.started_at, r.created_at) AS at,
               to_char(COALESCE(r.started_at, r.created_at) AT TIME ZONE :tz, 'HH24:MI') AS hhmm,
               c.id AS conversation_id, c.topic, cv.is_visit,
               vp.status, vp.draft, vp.final, vp.confirmed_at, vp.confirmed_by_name, vp.generated_at
        FROM recorder.recordings r
        LEFT JOIN analytics.conversations c ON c.recording_id = r.id
        LEFT JOIN analytics.clinic_visits cv ON cv.conversation_id = c.id
        LEFT JOIN analytics.visit_protocols vp ON vp.recording_id = r.id
        WHERE r.organization_id = :org AND r.seller_id = :seller AND r.session_date = :day
          AND r.status <> 'filtered'
        ORDER BY at DESC
        LIMIT 100
    """), {"org": org_id, "seller": seller_id, "day": day, "tz": tz})).fetchall()
    slug = (await db.execute(text("SELECT slug FROM auth.organizations WHERE id = :id"), {"id": org_id})).scalar()
    specialty = (await db.execute(text("SELECT specialty FROM analytics.clinic_doctors WHERE seller_id = :id"),
                                  {"id": seller_id})).scalar()

    def stage(r) -> str:
        if r.rec_status == "failed":
            return "failed"
        if r.conversation_id is None:
            return "processing"
        if r.is_visit is False:
            return "non_visit"
        return "ready" if r.status in ("draft", "confirmed") else "no_protocol"

    return {
        "is_demo": slug == DEMO_SLUG,
        "day": str(day),
        "fields": PROTOCOL_FIELDS,
        "doctor": {"seller_id": str(seller.id), "name": _name(seller.first_name, seller.last_name),
                   "store_name": seller.store_name, "specialty": specialty},
        "items": [{
            "recording_id": str(r.recording_id), "conversation_id": str(r.conversation_id) if r.conversation_id else None,
            "time": r.hhmm, "duration_sec": r.duration_seconds, "reason": r.topic, "stage": stage(r),
            "protocol": _protocol_out(r) if r.status else None,
        } for r in rows],
    }


class ProtocolIn(BaseModel):
    protocol: dict
    confirm: bool = False


@router.put("/doctors/{seller_id}/protocols/{recording_id}")
async def save_protocol(
    seller_id: uuid.UUID,
    recording_id: uuid.UUID,
    body: ProtocolIn,
    user: dict = Depends(get_mobile_user),
    db: AsyncSession = Depends(get_db),
):
    """Версия врача поверх черновика ИИ. confirm — врач проверил протокол; правки без
    подтверждения сохраняются, статус остаётся «черновик»."""
    seller = await _doctor_view(db, user, seller_id)
    org_id = uuid.UUID(user["organization_id"])
    row = (await db.execute(text("""
        SELECT status FROM analytics.visit_protocols
        WHERE recording_id = :rec AND organization_id = :org AND seller_id = :seller FOR UPDATE
    """), {"rec": recording_id, "org": org_id, "seller": seller_id})).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Протокол не найден")
    final = _clean_protocol(body.protocol)
    if body.confirm and not any(final.values()):
        raise HTTPException(status_code=422, detail="Пустой протокол нельзя подтвердить")
    if user.get("role") == "employee":
        who = _name(seller.first_name, seller.last_name)
    else:
        u = (await db.execute(text("SELECT first_name, last_name, email FROM auth.users WHERE id = :id"),
                              {"id": uuid.UUID(user["sub"])})).fetchone()
        who = (_name(u.first_name, u.last_name) or u.email) if u else None
    status = "confirmed" if body.confirm else "draft"
    saved = (await db.execute(text("""
        UPDATE analytics.visit_protocols SET final = CAST(:final AS jsonb), status = :status,
            confirmed_at = CASE WHEN :confirm THEN now() ELSE NULL END,
            confirmed_by = CASE WHEN :confirm THEN CAST(:by AS uuid) ELSE NULL END,
            confirmed_by_name = CASE WHEN :confirm THEN CAST(:who AS varchar) ELSE NULL END,
            updated_at = now()
        WHERE recording_id = :rec
        RETURNING status, draft, final, confirmed_at, confirmed_by_name, generated_at
    """), {"final": json.dumps(final, ensure_ascii=False), "status": status, "confirm": body.confirm,
           "by": user["sub"], "who": who, "rec": recording_id})).fetchone()
    await db.commit()
    return _protocol_out(saved)
