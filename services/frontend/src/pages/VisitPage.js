import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CircleCheck, Copy, OctagonAlert, TriangleAlert } from 'lucide-react';
import { clinicApi } from '@/api/clinic';
import { recorderApi } from '@/api/recorder';
import { ConversationPlayer } from '@/components/conversation/Player';
import { locateQuote } from '@/components/conversation/shared';
import { clock } from '@/components/ui/Fingerprint';
import { toast } from '@/components/ui/Toast';
import { CATEGORY, HINT, PROTOCOL_STATUS, ProtocolSections, STATUS, Score, SignalChip, StatusIcon, Tile, minutes, protocolText } from '@/components/clinic/shared';
import { L, t } from '@/i18n';
/* Карточка приёма: главное для главврача, протокол (черновик ИИ и версия врача), проверка по
   правилам с цитатами и расшифровка. Цитата ведёт к реплике: место находим по совпадению слов. */
const LANE = { seller: 's', customer: 'c', client: 'c' };
export function VisitPage() {
    const { id = '' } = useParams();
    const { data, isLoading, isError } = useQuery({ queryKey: ['clinic-visit', id], queryFn: () => clinicApi.visit(id), enabled: !!id });
    const [version, setVersion] = useState('final');
    const [focus, setFocus] = useState(null);
    const [audioUrl, setAudioUrl] = useState();
    const [audioState, setAudioState] = useState('loading');
    const playerRef = useRef(null);
    const listRef = useRef(null);
    const segments = useMemo(() => (data?.segments || []).filter((s) => s.start_ms != null).map((s) => ({
        start: (s.start_ms || 0) / 1000, end: (s.end_ms ?? s.start_ms ?? 0) / 1000,
        lane: LANE[s.speaker_role] || 'u', text: s.text, role: s.speaker_role,
    })), [data]);
    const items = useMemo(() => [...(data?.violations || []), ...(data?.checks || [])], [data]);
    // Где в расшифровке прозвучала цитата каждого правила
    const located = useMemo(() => items.map((c) => (c.quote ? locateQuote(c.quote, segments) : -1)), [items, segments]);
    const hits = useMemo(() => {
        const m = new Map();
        items.forEach((c, i) => {
            const idx = located[i];
            if (idx < 0 || c.kind !== 'forbidden')
                return;
            m.set(idx, c.category === 'fraud' || c.severity === 'high' ? 'crit' : 'warn');
        });
        return m;
    }, [items, located]);
    useEffect(() => {
        setAudioUrl(undefined);
        if (!data)
            return;
        if (!data.visit.recording_id || data.visit.source === 'transcript') {
            setAudioState('none');
            return;
        }
        setAudioState('loading');
        let url;
        let cancelled = false;
        recorderApi.getAudioBlobUrl(data.visit.recording_id)
            .then((u) => { if (cancelled)
            URL.revokeObjectURL(u);
        else {
            url = u;
            setAudioUrl(u);
            setAudioState('ready');
        } })
            .catch(() => { if (!cancelled)
            setAudioState('missing'); });
        return () => { cancelled = true; if (url)
            URL.revokeObjectURL(url); };
    }, [data]);
    if (isError)
        return _jsx("div", { className: "cl-visit", children: _jsx("div", { className: "panel up-empty", children: L('Приём не найден или недоступен.', 'The visit was not found or is not available.') }) });
    if (isLoading || !data)
        return _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') });
    const v = data.visit;
    const p = data.protocol;
    const hasFinal = !!p?.final;
    const shownVersion = hasFinal && version === 'final' ? p.final : p?.draft ?? null;
    const duration = v.duration_sec || (segments.length ? segments[segments.length - 1].end : 0);
    const events = items.flatMap((c, i) => {
        const idx = located[i];
        if (idx < 0 || c.kind !== 'forbidden')
            return [];
        return [{ t: segments[idx].start, kind: c.category === 'fraud' ? 'crit' : 'warn', label: c.title }];
    });
    const fraud = data.violations.filter((x) => x.category === 'fraud');
    const noteTone = fraud.length ? 'is-crit' : data.violations.length ? 'is-warn' : v.note && /полностью/.test(v.note) ? 'is-good' : 'is-warn';
    const NoteIcon = fraud.length ? OctagonAlert : noteTone === 'is-good' ? CircleCheck : TriangleAlert;
    const jump = (idx) => {
        if (idx < 0)
            return;
        setFocus(idx);
        playerRef.current?.seek(segments[idx].start);
        listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const copy = async () => {
        const header = [L('Протокол приёма', 'Visit note'), v.when, v.seller_name, v.specialty].filter(Boolean).join(' · ');
        try {
            await navigator.clipboard.writeText(protocolText(data.fields, shownVersion, header));
            toast(L('Протокол скопирован — вставьте его в МИС.', 'The note is copied — paste it into the EMR.'));
        }
        catch {
            toast(L('Не удалось скопировать. Выделите текст протокола вручную.', 'Could not copy. Select the note text manually.'));
        }
    };
    return (_jsxs("div", { className: "cl-visit", children: [_jsxs("nav", { className: "cl-crumbs", "aria-label": L('Навигация', 'Breadcrumbs'), children: [_jsx(Link, { to: "/visits", children: L('Приёмы', 'Visits') }), _jsx(ChevronRight, { "aria-hidden": "true" }), _jsx("span", { children: v.when })] }), _jsxs("header", { className: "cl-visit-head", children: [_jsxs("div", { children: [_jsx("h1", { className: "cl-visit-title", translate: "no", children: v.is_visit ? (v.reason || L('Приём', 'Visit')) : L('Не приём пациента', 'Not a patient visit') }), _jsxs("div", { className: "cl-visit-meta", children: [_jsxs("span", { translate: "no", children: [v.seller_name, v.specialty ? `, ${v.specialty.toLowerCase()}` : ''] }), _jsx("span", { translate: "no", children: v.store_name }), _jsx("span", { children: minutes(v.duration_sec) }), v.visit_type && _jsx("span", { children: v.visit_type === 'follow_up' ? L('повторный приём', 'follow-up visit') : L('первичный приём', 'first visit') })] })] }), v.is_visit && (_jsxs("div", { className: "cl-visit-scores", children: [_jsx(Tile, { title: L('Сервис', 'Service'), hint: HINT.service, value: _jsx(Score, { value: v.service }) }), _jsx(Tile, { title: L('Компетентность', 'Competence'), hint: HINT.competence, value: _jsx(Score, { value: v.competence }) })] }))] }), v.note && _jsxs("div", { className: `cl-note ${noteTone}`, children: [_jsx(NoteIcon, { "aria-hidden": "true" }), _jsx("span", { children: v.note })] }), !v.checks_done && v.is_visit && (_jsxs("div", { className: "cl-note is-warn", children: [_jsx(TriangleAlert, { "aria-hidden": "true" }), _jsx("span", { children: L('Проверка по правилам не удалась — запустите повторный анализ записи.', 'The rule check failed — re-run the analysis.') })] })), segments.length > 0 && (_jsx(ConversationPlayer, { ref: playerRef, src: audioUrl, duration: duration, segments: segments, stages: [], events: events, sourceLabel: v.source === 'mobile' ? L('Приложение врача', 'Doctor app') : undefined, audioNote: audioState === 'loading' ? t('Аудио загружается…') : audioState === 'missing' ? t('Аудиозапись недоступна') : audioState === 'none' ? t('Без аудио') : undefined })), _jsxs("div", { className: "cl-visit-grid", children: [_jsxs("section", { className: "panel", "aria-labelledby": "cl-proto", children: [_jsxs("div", { className: "panel-head cl-proto-head", children: [_jsxs("div", { children: [_jsx("h2", { id: "cl-proto", className: "panel-title", children: L('Протокол приёма', 'Visit note') }), _jsxs("div", { className: "cl-proto-state", children: [p && _jsx("span", { children: L(...(PROTOCOL_STATUS[p.status] || [p.status, p.status])) }), p?.status === 'confirmed' && p.confirmed_at && (_jsxs("span", { children: [new Date(p.confirmed_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), p.confirmed_by_name ? ` · ${p.confirmed_by_name}` : ''] }))] })] }), _jsxs("div", { className: "cl-toolbar", children: [hasFinal && (_jsxs("div", { className: "seg", role: "group", "aria-label": L('Версия протокола', 'Note version'), children: [_jsx("button", { type: "button", "aria-pressed": version === 'final', onClick: () => setVersion('final'), children: L('Версия врача', 'Doctor’s version') }), _jsx("button", { type: "button", "aria-pressed": version === 'draft', onClick: () => setVersion('draft'), children: L('Черновик ИИ', 'AI draft') })] })), shownVersion && (_jsxs("button", { type: "button", className: "btn btn-outline btn-sm", onClick: copy, children: [_jsx(Copy, { size: 14, "aria-hidden": "true" }), L('Скопировать', 'Copy')] }))] })] }), _jsxs("div", { className: "cl-panel-body", children: [!v.is_visit ? (_jsx("p", { className: "cl-muted", children: L('В записи нет приёма пациента — протокол не составляется.', 'The recording has no patient visit, so no note is drafted.') })) : (_jsx(ProtocolSections, { fields: data.fields, protocol: shownVersion, empty: p?.status === 'failed' ? L('Черновик составить не удалось. Запустите повторный анализ записи.', 'The draft could not be made. Re-run the analysis.')
                                            : L('Протокол ещё готовится.', 'The note is being prepared.') })), v.is_visit && shownVersion && (_jsx("p", { className: "cl-disclaimer", children: L('Черновик составлен ИИ только по тому, что прозвучало на приёме. Врач проверяет и подтверждает его в приложении.', 'The draft is made by AI only from what was said in the visit. The doctor reviews and confirms it in the app.') }))] })] }), _jsxs("section", { className: "panel", "aria-labelledby": "cl-checks", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "cl-checks", className: "panel-title", children: L('Проверка по правилам', 'Rule check') }), _jsx("div", { className: "panel-sub", children: L('Нажмите на цитату — откроется место в расшифровке.', 'Click a quote to open its place in the transcript.') })] }) }), _jsxs("div", { className: "cl-panel-body", children: [data.violations.length > 0 && (_jsxs(_Fragment, { children: [_jsx("h3", { className: "cl-group-title", children: L('Не должно быть', 'Must not happen') }), _jsx("ul", { className: "cl-checks", children: data.violations.map((c, i) => _jsx(CheckRow, { c: c, idx: located[i], onJump: jump }, `v${i}`)) })] })), ['service', 'competence'].map((cat) => {
                                        const rows = data.checks.map((c, i) => ({ c, idx: located[data.violations.length + i] })).filter((x) => x.c.category === cat);
                                        if (!rows.length)
                                            return null;
                                        return (_jsxs("div", { children: [_jsx("h3", { className: "cl-group-title", children: L(...CATEGORY[cat]) }), _jsx("ul", { className: "cl-checks", children: rows.sort((a, b) => order(a.c) - order(b.c)).map(({ c, idx }, i) => _jsx(CheckRow, { c: c, idx: idx, onJump: jump }, `${cat}${i}`)) })] }, cat));
                                    }), !items.length && _jsx("p", { className: "cl-muted", children: L('Проверок по правилам нет.', 'No rule checks.') })] })] })] }), _jsxs("section", { className: "panel", "aria-labelledby": "cl-tr", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "cl-tr", className: "panel-title", children: L('Расшифровка', 'Transcript') }), _jsx("div", { className: "panel-sub", children: L('Реплики, где сработал запрет, выделены.', 'Lines where a prohibition was triggered are highlighted.') })] }) }), _jsx("div", { className: "cl-panel-body", children: _jsx("ol", { className: "cl-transcript", ref: listRef, children: segments.map((s, i) => (_jsxs("li", { "data-idx": i, className: `cl-line ${s.role === 'seller' ? 'is-doctor' : 'is-patient'}${hits.has(i) ? ` is-hit${hits.get(i) === 'crit' ? ' is-crit' : ''}` : ''}${focus === i ? ' is-focus' : ''}`, children: [_jsx("span", { className: "cl-line-time", children: clock(s.start) }), _jsx("span", { className: "cl-line-who", children: s.role === 'seller' ? L('Врач', 'Doctor') : s.role === 'unknown' ? '—' : L('Пациент', 'Patient') }), _jsx("span", { translate: "no", children: s.text })] }, i))) }) })] })] }));
}
// Сначала то, что не выполнено: так главврач видит проблемы первыми
const order = (c) => ({ missed: 0, partial: 1, met: 2, na: 3, violated: -1 }[c.status] ?? 4);
function CheckRow({ c, idx, onJump }) {
    const forbidden = c.kind === 'forbidden';
    return (_jsxs("li", { className: "cl-check", children: [_jsx(StatusIcon, { status: c.status }), _jsxs("div", { children: [_jsxs("div", { className: "cl-check-title", children: [forbidden ? _jsx(SignalChip, { title: c.title, category: c.category, severity: c.severity }) : _jsx("span", { translate: "no", children: c.title }), !forbidden && _jsx("span", { className: "cl-check-status", children: L(...STATUS[c.status].label) })] }), c.comment && _jsx("div", { className: "cl-check-comment", translate: "no", children: c.comment }), c.quote && (idx >= 0
                        ? _jsxs("button", { type: "button", className: `cl-quote ${forbidden ? 'is-crit' : 'is-good'}`, onClick: () => onJump(idx), translate: "no", children: ["\u00AB", c.quote, "\u00BB"] })
                        : _jsxs("span", { className: `cl-quote ${forbidden ? 'is-crit' : 'is-good'}`, translate: "no", children: ["\u00AB", c.quote, "\u00BB"] }))] })] }));
}
