import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Link2, Trash2, Search, X, ShieldAlert, MessageCircleWarning, CircleCheck, CircleX, Sparkles, RefreshCw, Loader, ShoppingBag, AlertCircle, } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { analyticsApi } from '@/api/analytics';
import { recorderApi } from '@/api/recorder';
import { OutcomeTag } from '@/components/OutcomeTag';
import { Meter } from '@/components/ui/Meter';
import { clock } from '@/components/ui/Fingerprint';
import { highlightSegmentText } from '@/components/scripts/conversationHelpers';
import { ConversationPlayer, } from '@/components/conversation/Player';
import { CALL_CATEGORY_LABELS, ClientHistory, SummaryMarkdown, BLOCK_STATUS_META, locateQuote, useConversationAnalysis, useObjectionTypeLabel, } from '@/components/conversation/shared';
import { t, L, locale } from '@/i18n';
/* Карточка разговора по концепту (ui-concept/conversation.html): шапка с вердиктом,
   плеер-консоль с дорожками, расшифровка с пометками на полях и разбор справа.
   Возражения, нарушения и доказательства этапов хранятся цитатами — их место в
   разговоре находим по совпадению слов (locateQuote). */
const LANE = { seller: 's', customer: 'c', client: 'c' };
const PAUSE_SEC = 10;
function initialsOf(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function fmtWeight(w) {
    if (w == null)
        return '';
    return L(`вес ${w.toFixed(2).replace('.', ',')}`, `weight ${w.toFixed(2)}`);
}
export function ConversationPage() {
    const { id = '' } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const objectionLabel = useObjectionTypeLabel();
    const playerRef = useRef(null);
    const trRef = useRef(null);
    const [now, setNow] = useState(0);
    const [follow, setFollow] = useState(true);
    const [query, setQuery] = useState('');
    const [audioUrl, setAudioUrl] = useState();
    const [audioState, setAudioState] = useState('loading');
    const [copied, setCopied] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['conversation-detail', id],
        queryFn: () => dashboardApi.getConversationDetail(id),
        enabled: !!id,
    });
    const c = data?.conversation || {};
    const rawSegments = data?.transcript?.segments || [];
    const segments = useMemo(() => rawSegments
        .filter((s) => s.start_ms != null)
        .map((s) => ({
        start: (s.start_ms || 0) / 1000,
        end: (s.end_ms ?? s.start_ms ?? 0) / 1000,
        lane: LANE[(s.speaker_role || '').toLowerCase()] || 'u',
        text: s.text || '',
    })), [rawSegments]);
    const { highlightRules, upsellResults, crosssellResults } = useConversationAnalysis(c, rawSegments);
    // Аудио — blob с авторизацией
    useEffect(() => {
        setAudioUrl(undefined);
        if (!data)
            return;
        if (!c.recording_id || c.source === 'transcript') {
            setAudioState('none');
            return;
        }
        setAudioState('loading');
        let url;
        let cancelled = false;
        recorderApi.getAudioBlobUrl(c.recording_id)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, c.recording_id, c.source]);
    const duration = Number(c.duration_seconds) || (segments.length ? segments[segments.length - 1].end : 0);
    const scriptResult = (c.script_results || []).find((sr) => sr.was_applied !== false) || (c.script_results || [])[0];
    const steps = scriptResult?.step_scores || [];
    const blocks = scriptResult?.block_results || [];
    const isFulltext = scriptResult?.script_type === 'fulltext' && blocks.length > 0;
    const objections = c.objections || [];
    const violations = c.compliance_violations || [];
    // ── Где что прозвучало ────────────────────────────────────────────────────
    const located = useMemo(() => {
        const seg = segments;
        const at = (quote) => locateQuote(quote || '', seg);
        const stagesRaw = [];
        if (isFulltext) {
            blocks.forEach((b, i) => {
                if (b.status === 'missed' || b.status === 'not_applicable')
                    return;
                const idx = at(b.quote || '');
                if (idx >= 0)
                    stagesRaw.push({ idx, n: i + 1, title: b.title, score: null, weight: null });
            });
        }
        else {
            steps.forEach((s, i) => {
                const idx = at(s.evidence || '');
                if (idx >= 0)
                    stagesRaw.push({ idx, n: i + 1, title: s.step_name, score: Number(s.score ?? 0), weight: s.weight ?? null });
            });
        }
        stagesRaw.sort((a, b) => a.idx - b.idx);
        const stages = stagesRaw.map((s, i) => ({
            start: seg[s.idx].start,
            end: i + 1 < stagesRaw.length ? seg[stagesRaw[i + 1].idx].start : duration,
            n: s.n,
            title: s.title,
            score: s.score,
        }));
        const stageAt = new Map();
        stagesRaw.forEach((s) => { if (!stageAt.has(s.idx))
            stageAt.set(s.idx, s); });
        const notes = new Map();
        const events = [];
        const push = (idx, note, ev, label) => {
            if (idx < 0)
                return;
            notes.set(idx, [...(notes.get(idx) || []), note]);
            events.push({ t: seg[idx].start, kind: ev, label });
        };
        violations.forEach((v) => {
            const high = (v.severity || '').toLowerCase() === 'high';
            push(at(v.evidence), {
                kind: 'crit',
                title: `${v.rule_title}${high ? '' : ` · ${t('средняя важность')}`}`,
                body: v.explanation,
            }, high ? 'crit' : 'crit-mid', v.rule_title);
        });
        objections.forEach((o) => {
            const label = objectionLabel(o.type);
            push(at(o.raw_text), {
                kind: o.is_resolved ? 'good' : 'warn',
                title: L(`Возражение «${label}» — ${o.is_resolved ? 'отработано' : 'без ответа'}`, `Objection “${t(label)}” — ${o.is_resolved ? 'handled' : 'unanswered'}`),
                body: o.resolution_technique || undefined,
            }, o.is_resolved ? 'warn-ok' : 'warn', L(`возражение «${label}»`, `objection “${t(label)}”`));
        });
        for (const [results, kind] of [[upsellResults, 'Апсейл'], [crosssellResults, 'Кросс-сейл']]) {
            for (const r of results) {
                const offers = r.offer_quotes || {};
                const firstQuote = Object.values(offers).flat().find((q) => typeof q === 'string');
                const required = (r.required_offers || []).length;
                const offered = (r.offered_items || []).length;
                if (!firstQuote)
                    continue;
                push(at(firstQuote), {
                    kind: offered >= required ? 'good' : 'warn',
                    title: L(`${kind} · ${offered} из ${required} по правилу «${r.trigger_product}»`, `${t(kind)} · ${offered} of ${required} for “${r.trigger_product}”`),
                    body: (r.missed_items || []).length ? L(`Не предложено: ${r.missed_items.join(', ')}`, `Not offered: ${r.missed_items.join(', ')}`) : undefined,
                }, 'ok', t('предложение допродажи'));
            }
        }
        events.sort((a, b) => a.t - b.t);
        return { stages, stageAt, notes, events };
    }, [segments, isFulltext, blocks, steps, violations, objections, upsellResults, crosssellResults, duration, objectionLabel]);
    const playerSegments = useMemo(() => segments.map(({ start, end, lane }) => ({ start, end, lane })), [segments]);
    // Текущая реплика — для подсветки и «Следовать»
    const nowIdx = useMemo(() => {
        let idx = -1;
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].start <= now + 0.05)
                idx = i;
            else
                break;
        }
        return idx;
    }, [segments, now]);
    useEffect(() => {
        if (!follow || nowIdx < 0 || !trRef.current)
            return;
        const el = trRef.current.querySelector(`[data-seg="${nowIdx}"]`);
        if (!el)
            return;
        const box = trRef.current;
        const top = el.offsetTop - box.offsetTop;
        if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 80) {
            box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: 'smooth' });
        }
    }, [nowIdx, follow]);
    // Ссылка на момент: /conversations/:id?t=125
    useEffect(() => {
        const ts = Number(searchParams.get('t'));
        if (ts > 0 && segments.length)
            setTimeout(() => playerRef.current?.seek(ts), 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments.length]);
    const copyMoment = async () => {
        const url = `${window.location.origin}/conversations/${id}?t=${Math.round(now)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch {
            window.prompt(t('Ссылка на момент'), url);
        }
    };
    const handleDelete = async () => {
        if (!window.confirm(t('Удалить этот диалог? Действие необратимо — разговор, транскрипт и запись будут удалены.')))
            return;
        setDeleting(true);
        try {
            await analyticsApi.deleteConversation(id);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            navigate('/conversations', { replace: true });
        }
        catch {
            alert(t('Не удалось удалить диалог. Попробуйте ещё раз.'));
            setDeleting(false);
        }
    };
    if (isLoading)
        return _jsx("div", { className: "cv-page", children: _jsx("div", { className: "muted", style: { padding: 24 }, children: t('Загрузка...') }) });
    if (isError || !data) {
        return (_jsx("div", { className: "cv-page", children: _jsxs("div", { className: "empty", children: [_jsx("h3", { children: t('Разговор не найден') }), _jsx("p", { children: t('Возможно, он удалён или недоступен вашей роли.') }), _jsx(Link, { className: "btn btn-sm", to: "/conversations", children: t('К списку разговоров') })] }) }));
    }
    const when = c.recorded_at || c.analyzed_at || c.session_date;
    const whenDate = when ? new Date(when) : null;
    const notScored = c.is_scorable === false;
    const score = c.overall_score != null ? Math.round(c.overall_score) : null;
    const upsell = (() => {
        let done = 0, need = 0;
        for (const r of [...upsellResults, ...crosssellResults]) {
            const req = (r.required_offers || []).length;
            need += req;
            done += Math.min((r.offered_items || []).length, req);
        }
        return need ? [done, need] : null;
    })();
    const q = query.trim().toLowerCase();
    const isCall = !!c.call_direction || (c.source || '').startsWith('call');
    const sourceLabel = c.source === 'badge' ? t('Бейдж · вырезан из записи смены')
        : c.source === 'transcript' ? t('Загружен текстом — без аудио')
            : isCall ? (c.call_direction === 'inbound' ? t('Входящий звонок') : t('Исходящий звонок'))
                : t('Загруженное аудио');
    // Разбор балла: ширина — вес этапа, заливка — балл
    const weightSum = steps.reduce((a, s) => a + (s.weight ?? 0), 0) || steps.length || 1;
    const lost = steps
        .map((s) => ({ name: s.step_name, lost: ((s.weight ?? 1 / steps.length) * (100 - Number(s.score ?? 0))) }))
        .sort((a, b) => b.lost - a.lost)[0];
    return (_jsxs("div", { className: "cv-page", children: [_jsxs("nav", { className: "cv-crumbs", "aria-label": t('Навигация'), children: [_jsx(Link, { to: "/conversations", children: t('Разговоры') }), _jsx(ChevronRight, { size: 14, "aria-hidden": "true" }), _jsx("span", { translate: "no", children: c.store_name || '—' }), _jsx(ChevronRight, { size: 14, "aria-hidden": "true" }), _jsx("span", { children: whenDate ? `${whenDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}, ${whenDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}` : '—' })] }), _jsxs("header", { className: "cv-head", children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("h1", { className: "cv-title", translate: c.topic ? 'no' : undefined, children: c.topic || t('Разговор без темы') }), _jsxs("div", { className: "cv-meta", children: [_jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initialsOf(c.seller_name) }), _jsxs("span", { children: [_jsx("span", { className: "person-name", translate: "no", children: c.seller_name || '—' }), _jsx("span", { className: "person-sub", translate: "no", children: c.store_name })] })] }), _jsx("span", { className: "cv-dot", "aria-hidden": "true", children: "\u00B7" }), _jsx("span", { children: whenDate ? whenDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + whenDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsx("span", { className: "cv-dot", "aria-hidden": "true", children: "\u00B7" }), _jsx("span", { className: "mono", children: clock(duration) }), c.client_phone && _jsxs(_Fragment, { children: [_jsx("span", { className: "cv-dot", "aria-hidden": "true", children: "\u00B7" }), _jsx("span", { className: "mono", translate: "no", children: c.client_phone })] })] })] }), _jsxs("div", { children: [_jsxs("div", { className: "cv-verdict", children: [_jsxs("div", { className: "cv-card", children: [_jsxs("div", { className: "cv-card-label", children: [t('Исход'), c.outcome_confidence != null && L(` · уверенность ${Math.round(c.outcome_confidence * 100)} %`, ` · confidence ${Math.round(c.outcome_confidence * 100)}%`)] }), _jsx(OutcomeTag, { outcome: c.outcome || 'unknown' })] }), _jsxs("div", { className: "cv-card", children: [_jsx("div", { className: "cv-card-label", children: t('Балл по скрипту') }), _jsx("div", { className: "cv-card-value", children: notScored || score == null ? '—' : _jsxs(_Fragment, { children: [score, " ", _jsx("small", { children: "/ 100" })] }) })] }), _jsxs("div", { className: `cv-card ${violations.length ? 'is-crit' : ''}`, children: [_jsx("div", { className: "cv-card-label", children: t('Нарушения') }), _jsx("div", { className: "cv-card-value", children: violations.length })] }), _jsxs("div", { className: "cv-card", children: [_jsx("div", { className: "cv-card-label", children: t('Допродажа') }), _jsx("div", { className: "cv-card-value", children: upsell ? _jsxs(_Fragment, { children: [upsell[0], " ", _jsx("small", { children: L(`из ${upsell[1]}`, `of ${upsell[1]}`) })] }) : '—' })] })] }), _jsxs("div", { className: "cv-actions", children: [_jsxs("button", { type: "button", className: "btn", onClick: copyMoment, children: [_jsx(Link2, { size: 15, "aria-hidden": "true" }), copied ? t('Ссылка скопирована') : t('Ссылка на момент')] }), _jsxs("button", { type: "button", className: "btn btn-ghost cv-danger", onClick: handleDelete, disabled: deleting, children: [_jsx(Trash2, { size: 15, "aria-hidden": "true" }), deleting ? t('Удаление…') : t('Удалить')] })] })] })] }), notScored && (_jsxs("div", { className: "search-note", style: { background: 'var(--panel-2)' }, children: [_jsx(AlertCircle, { size: 16, "aria-hidden": "true" }), _jsx("span", { children: L(`Звонок отнесён к категории «${CALL_CATEGORY_LABELS[c.call_category] || c.call_category || 'нецелевой'}» и не оценивается по скрипту — он не влияет на рейтинг.`, `The call is categorised as “${t(CALL_CATEGORY_LABELS[c.call_category] || c.call_category || 'нецелевой')}” and isn’t scored against the script — it doesn’t affect the rating.`) })] })), _jsx(ConversationPlayer, { ref: playerRef, src: audioUrl, duration: duration, segments: playerSegments, stages: located.stages, events: located.events, sourceLabel: sourceLabel, audioNote: audioState === 'loading' ? t('Аудио загружается…') : audioState === 'missing' ? t('Аудиозапись недоступна') : audioState === 'none' ? t('Без аудио') : undefined, onTime: setNow }), _jsxs("div", { className: "cv-grid", children: [_jsxs("div", { className: "cv-main", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "cv-tr-head", children: [_jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Расшифровка') }), _jsx("div", { className: "panel-sub", children: L(`${segments.length} реплик · роли размечены автоматически`, `${segments.length} turns · roles detected automatically`) })] }), _jsxs("div", { className: "cv-tr-tools", children: [_jsxs("label", { className: "input", style: { height: 30, width: 210 }, children: [_jsx(Search, { size: 14, "aria-hidden": "true" }), _jsx("input", { type: "search", value: query, onChange: (e) => setQuery(e.target.value), placeholder: t('Найти в разговоре…'), "aria-label": t('Найти в разговоре…') }), query && _jsx("button", { type: "button", onClick: () => setQuery(''), "aria-label": t('Очистить'), children: _jsx(X, { size: 13 }) })] }), _jsxs("button", { type: "button", role: "switch", "aria-checked": follow, className: "cv-switch", onClick: () => setFollow((v) => !v), children: [_jsx("span", { className: "cv-switch-track", "aria-hidden": "true" }), t('Следовать')] })] })] }), _jsxs("div", { className: "cv-transcript", ref: trRef, children: [segments.length === 0 && _jsx("div", { className: "empty", children: _jsx("p", { children: t('Расшифровки нет.') }) }), segments.map((seg, i) => {
                                                const prev = segments[i - 1];
                                                const gap = prev ? seg.start - prev.end : 0;
                                                const stage = located.stageAt.get(i);
                                                const notes = located.notes.get(i) || [];
                                                const hit = q && seg.text.toLowerCase().includes(q);
                                                const who = seg.lane === 's' ? (isCall ? t('Оператор') : t('Продавец')) : seg.lane === 'c' ? t('Покупатель') : '—';
                                                return (_jsxs("div", { children: [gap >= PAUSE_SEC && (_jsx("div", { className: "cv-gap", children: L(`Пауза ${Math.round(gap)} с`, `Pause ${Math.round(gap)} s`) })), _jsxs("div", { "data-seg": i, className: `cv-line is-${seg.lane} ${i === nowIdx ? 'is-now' : ''} ${q && !hit ? 'is-dim' : ''}`, children: [stage && (_jsxs("span", { className: "cv-step-chip", children: [_jsx("b", { children: stage.n }), _jsx("span", { translate: "no", children: stage.title }), stage.score != null && _jsx("span", { className: `sc ${stage.score < 60 ? 'is-low' : ''}`, children: Math.round(stage.score) })] })), _jsx("button", { type: "button", className: "cv-tc", onClick: () => playerRef.current?.seek(seg.start, true), "aria-label": L(`Слушать с ${clock(seg.start)}`, `Play from ${clock(seg.start)}`), children: clock(seg.start) }), _jsx("span", { className: "cv-who", children: who }), _jsx("span", { className: "cv-txt", translate: "no", children: q && hit ? _jsx(SearchMark, { text: seg.text, q: q }) : highlightSegmentText(seg.text, seg.lane === 's' ? highlightRules : highlightRules.filter((r) => !r.kind.startsWith('upsell-') && !r.kind.startsWith('crosssell-'))) }), notes.map((n, k) => (_jsxs("div", { className: `cv-note is-${n.kind}`, children: [_jsxs("div", { className: "cv-note-title", children: [n.kind === 'crit' ? _jsx(ShieldAlert, { size: 14, "aria-hidden": "true" }) : n.kind === 'warn' ? _jsx(MessageCircleWarning, { size: 14, "aria-hidden": "true" }) : _jsx(CircleCheck, { size: 14, "aria-hidden": "true" }), _jsx("span", { children: n.title })] }), n.body && _jsx("div", { translate: "no", children: n.body })] }, k)))] })] }, i));
                                            })] })] }), _jsx(DynamicsPanel, { c: c, segments: segments })] }), _jsxs("aside", { className: "cv-side", children: [_jsx(SummaryPanel, { conversationId: id, cached: c.summary }), scriptResult && !notScored && (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsxs("h2", { className: "panel-title", children: [isFulltext ? t('Покрытие скрипта') : t('Скрипт'), ": ", score ?? '—', " ", L('из 100', 'of 100')] }), _jsx("div", { className: "panel-sub", translate: "no", children: scriptResult.script_name })] }) }), _jsxs("div", { className: "panel-body", children: [!isFulltext && steps.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "cv-wbar", "aria-hidden": "true", children: steps.map((s, i) => (_jsx("div", { className: `cv-wseg ${Number(s.score ?? 0) < 60 ? 'is-low' : ''}`, style: { flex: `${(s.weight ?? 1 / steps.length) / weightSum} 1 0` }, title: `${s.step_name}: ${Math.round(Number(s.score ?? 0))}`, children: _jsx("span", { style: { width: `${Math.max(0, Math.min(100, Number(s.score ?? 0)))}%` } }) }, i))) }), _jsxs("div", { className: "cv-wbar-note", children: [L('Ширина — вес этапа, заливка — балл.', 'Width is the stage weight, fill is the score.'), lost && lost.lost > 0.5 && L(` Больше всего баллов потеряно на этапе «${lost.name}».`, ` Most points were lost at “${lost.name}”.`)] })] })), !isFulltext && steps.map((s, i) => {
                                                const idx = locateQuote(s.evidence || '', segments);
                                                return (_jsxs("div", { className: "cv-step-line", children: [_jsx("span", { className: "cv-step-n", children: i + 1 }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "cv-step-name", children: [_jsx("span", { translate: "no", children: s.step_name }), _jsx("span", { className: "cv-step-w", children: fmtWeight(s.weight) })] }), s.evidence && _jsxs("div", { className: "cv-step-note", translate: "no", children: ["\u00AB", s.evidence, "\u00BB"] }), idx >= 0 && (_jsxs("button", { type: "button", className: "cv-step-go", onClick: () => playerRef.current?.seek(segments[idx].start, true), children: ["\u25B6 ", clock(segments[idx].start)] }))] }), _jsx(Meter, { score: s.score })] }, i));
                                            }), isFulltext && blocks.map((b, i) => {
                                                const meta = BLOCK_STATUS_META[b.status] || BLOCK_STATUS_META.missed;
                                                const idx = b.quote ? locateQuote(b.quote, segments) : -1;
                                                const tone = b.status === 'spoken' ? 'is-good' : b.status === 'paraphrased' ? 'is-warn' : b.status === 'missed' ? 'is-crit' : 'is-plain';
                                                return (_jsxs("div", { className: "cv-step-line", children: [_jsx("span", { className: "cv-step-n", children: i + 1 }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "cv-step-name", children: [_jsx("span", { translate: "no", children: b.title }), !b.is_mandatory && _jsx("span", { className: "cv-step-w", children: t('ситуативный') })] }), b.quote && _jsxs("div", { className: "cv-step-note", translate: "no", children: ["\u00AB", b.quote, "\u00BB"] }), b.comment && _jsx("div", { className: "cv-step-note", translate: "no", children: b.comment }), idx >= 0 && (_jsxs("button", { type: "button", className: "cv-step-go", onClick: () => playerRef.current?.seek(segments[idx].start, true), children: ["\u25B6 ", clock(segments[idx].start)] }))] }), _jsx("span", { className: `flag ${tone}`, children: t(meta.label) })] }, b.block_id || i));
                                            })] })] })), (upsellResults.length > 0 || crosssellResults.length > 0) && (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h2", { className: "panel-title", children: t('Допродажа') }) }), _jsx("div", { className: "panel-body", children: [...upsellResults.map((r) => ['Апсейл', r]), ...crosssellResults.map((r) => ['Кросс-сейл', r])].map(([kind, r], i) => (_jsxs("div", { className: "cv-offer-group", children: [_jsxs("div", { className: "cv-offer-head", children: [_jsx(ShoppingBag, { size: 14, "aria-hidden": "true" }), _jsxs("span", { children: [t(kind), " \u00B7 ", _jsx("span", { translate: "no", children: r.trigger_product })] })] }), (r.required_offers || []).map((item) => {
                                                    const yes = (r.offered_items || []).includes(item);
                                                    return (_jsxs("div", { className: `cv-offer ${yes ? 'is-yes' : 'is-no'}`, children: [yes ? _jsx(CircleCheck, { "aria-hidden": "true" }) : _jsx(CircleX, { "aria-hidden": "true" }), _jsx("span", { translate: "no", children: item }), _jsx("span", { className: "muted", children: yes ? t('предложено') : t('не предложено') })] }, item));
                                                })] }, i))) })] })), (objections.length > 0 || violations.length > 0) && (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsx("h2", { className: "panel-title", children: t('Возражения и нарушения') }) }), _jsx("div", { className: "panel-body cv-moments", children: [
                                            ...violations.map((v) => ({ key: `v${v.id}`, quote: v.evidence, kind: (v.severity === 'high' ? 'crit' : 'crit-mid'), title: v.rule_title, sub: v.explanation })),
                                            ...objections.map((o, i) => ({ key: `o${i}`, quote: o.raw_text, kind: (o.is_resolved ? 'warn-ok' : 'warn'), title: L(`Возражение «${objectionLabel(o.type)}»`, `Objection “${t(objectionLabel(o.type))}”`), sub: o.is_resolved ? (o.resolution_technique || t('Отработано')) : t('Без ответа') })),
                                        ].map((m) => {
                                            const idx = locateQuote(m.quote || '', segments);
                                            return (_jsxs("div", { className: "cv-moment", children: [_jsx("button", { type: "button", className: "cv-step-go", disabled: idx < 0, onClick: () => idx >= 0 && playerRef.current?.seek(segments[idx].start, true), children: idx >= 0 ? clock(segments[idx].start) : '—' }), _jsx("span", { className: `mk is-${m.kind}`, "aria-hidden": "true" }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: "cv-step-name", children: m.title }), m.quote && _jsxs("div", { className: "cv-step-note", translate: "no", children: ["\u00AB", m.quote, "\u00BB"] }), m.sub && _jsx("div", { className: "cv-step-note", translate: "no", children: m.sub })] })] }, m.key));
                                        }) })] })), _jsx(ClientHistory, { conversationId: id, onSelect: (other) => navigate(`/conversations/${other}`) })] })] })] }));
}
function SearchMark({ text, q }) {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0)
        return _jsx(_Fragment, { children: text });
    return _jsxs(_Fragment, { children: [text.slice(0, i), _jsx("mark", { className: "cv-search-hit", children: text.slice(i, i + q.length) }), text.slice(i + q.length)] });
}
/** Итог разговора — резюме LLM. Готовое приходит в карточке; составляем по кнопке. */
function SummaryPanel({ conversationId, cached }) {
    const [summary, setSummary] = useState(cached || null);
    const [state, setState] = useState('idle');
    useEffect(() => { setSummary(cached || null); setState('idle'); }, [conversationId, cached]);
    const generate = async (force) => {
        setState('loading');
        try {
            const res = await analyticsApi.getConversationSummary(conversationId, force);
            setSummary(res?.summary || null);
            setState('idle');
        }
        catch (e) {
            setState(e?.response?.status === 422 ? 'no-transcript' : 'error');
        }
    };
    return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("h2", { className: "panel-title", style: { display: 'flex', alignItems: 'center', gap: 7 }, children: [_jsx(Sparkles, { size: 15, "aria-hidden": "true", style: { color: 'var(--accent)' } }), t('Итог разговора')] }), summary && (_jsx("button", { type: "button", className: "btn-icon", onClick: () => generate(true), disabled: state === 'loading', title: t('Сгенерировать резюме заново'), "aria-label": t('Сгенерировать резюме заново'), children: _jsx(RefreshCw, { size: 14, "aria-hidden": "true" }) }))] }), _jsxs("div", { className: "panel-body", children: [state === 'loading' ? (_jsxs("div", { className: "muted", style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Loader, { size: 14, "aria-hidden": "true" }), t('ИИ составляет резюме диалога...')] })) : summary ? (_jsx("div", { translate: "no", children: _jsx(SummaryMarkdown, { text: summary }) })) : state === 'no-transcript' ? (_jsx("div", { className: "muted", children: t('Для этого разговора нет транскрипта — резюме недоступно.') })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "muted", style: { marginBottom: 10 }, children: t('Короткий разбор: что произошло, что сработало и что поправить.') }), state === 'error' && _jsx("p", { style: { color: 'var(--crit-ink)', marginBottom: 10 }, children: t('Не удалось сгенерировать резюме. Попробуйте ещё раз позже.') }), _jsxs("button", { type: "button", className: "btn btn-sm", onClick: () => generate(false), children: [_jsx(Sparkles, { size: 13, "aria-hidden": "true" }), t('Составить резюме')] })] })), summary && _jsx("div", { className: "cv-step-note", style: { marginTop: 10 }, children: t('Резюме составлено ИИ на основе транскрипта. Может содержать неточности.') })] })] }));
}
/** Динамика: кто сколько говорил, перебивания, монолог, тишина. */
function DynamicsPanel({ c, segments }) {
    const seller = segments.filter((s) => s.lane === 's').reduce((a, s) => a + (s.end - s.start), 0);
    const customer = segments.filter((s) => s.lane === 'c').reduce((a, s) => a + (s.end - s.start), 0);
    const share = c.talk_ratio != null ? Math.round(c.talk_ratio * 100) : (seller + customer ? Math.round((seller / (seller + customer)) * 100) : null);
    if (share == null)
        return null;
    const tooMuch = share > 65;
    return (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Динамика разговора') }), _jsx("div", { className: "panel-sub", children: t('Доля времени речи сотрудника. Ориентир для продаж — 40–60%') })] }) }), _jsxs("div", { className: "panel-body", children: [_jsxs("div", { className: "cv-talk", "aria-hidden": "true", children: [_jsx("span", { style: { flex: share } }), _jsx("span", { style: { flex: 100 - share } })] }), _jsxs("div", { className: "cv-talk-legend", children: [_jsxs("span", { children: [t('Продавец'), " ", _jsxs("b", { children: [share, " %"] })] }), _jsxs("span", { children: [t('Покупатель'), " ", _jsxs("b", { children: [100 - share, " %"] })] })] }), tooMuch && _jsxs("div", { className: "cv-talk-note", children: [_jsx(AlertCircle, { size: 14, "aria-hidden": "true" }), t('Продавец говорит больше нормы — покупатель мало рассказал о задаче.')] }), _jsxs("div", { className: "cv-dyn-grid", children: [_jsxs("div", { className: "cv-dyn", title: t('Сколько раз стороны перебивали друг друга'), children: [_jsx("b", { children: c.interruptions_count ?? '—' }), _jsx("span", { children: t('Перебивания') })] }), _jsxs("div", { className: "cv-dyn", title: t('Самый длинный непрерывный монолог сотрудника'), children: [_jsx("b", { children: c.longest_monologue_seconds != null ? clock(c.longest_monologue_seconds) : '—' }), _jsx("span", { children: t('Макс. монолог') })] }), _jsxs("div", { className: "cv-dyn", title: t('Доля пауз без речи от длительности разговора'), children: [_jsx("b", { children: c.silence_ratio != null ? `${Math.round(c.silence_ratio * 100)} %` : '—' }), _jsx("span", { children: t('Тишина') })] })] })] })] }));
}
