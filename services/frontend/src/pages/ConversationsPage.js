import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { adminApi } from '@/api/admin';
import { recorderApi } from '@/api/recorder';
import { scriptsApi } from '@/api/scripts';
import { ScoreBadge } from '@/components/ScoreBadge';
import { OutcomeTag } from '@/components/OutcomeTag';
import { Drawer } from '@/components/Drawer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AudioUploadModal } from '@/components/AudioUpload';
import { TranscriptUploadModal } from '@/components/TranscriptUpload';
import { CallUploadModal } from '@/components/CallUpload';
import { useTerms } from '@/lib/terms';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { Upload, CheckCircle, Clock, Loader, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, X, FileText, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { MultiSelect } from '@/components/scripts/MultiSelect';
import { avatarColorFor, highlightSegmentText, highlightRulesForSell, analyzeSell, } from '@/components/scripts/conversationHelpers';
const OUTCOME_LABELS = {
    purchase: 'Покупка',
    deferred: 'Отложено',
    price_refusal: 'Отказ по цене',
    competitor: 'Ушёл к конкурентам',
    unknown: 'Не определён',
};
// Исходы звонков (телефония) — добавляются к фильтру для telephony-организаций
const TELEPHONY_OUTCOME_LABELS = {
    purchase: 'Продажа / заявка',
    appointment: 'Встреча назначена',
    callback: 'Перезвон',
    deferred: 'Думает',
    refusal: 'Отказ',
    transfer: 'Перевод звонка',
    non_target: 'Нецелевой',
    voicemail: 'Недозвон',
    unknown: 'Не определён',
};
function DirectionIcon({ direction }) {
    if (direction === 'inbound')
        return _jsx(PhoneIncoming, { size: 13, style: { color: 'var(--success)', flexShrink: 0 }, "aria-label": "\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0439" });
    if (direction === 'outbound')
        return _jsx(PhoneOutgoing, { size: 13, style: { color: '#6366F1', flexShrink: 0 }, "aria-label": "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0439" });
    return null;
}
const OBJECTION_TYPE_LABELS = {
    price: 'Цена',
    quality: 'Качество',
    competitors: 'Конкуренты',
    timing: 'Время',
    trust: 'Доверие',
    not_ready: 'Не готов',
    functionality: 'Функциональность',
};
/** Лейблы типов возражений: настраиваемый справочник организации поверх стандартных. */
function useObjectionTypeLabel() {
    const { data: types } = useQuery({
        queryKey: ['objection-types'],
        queryFn: () => scriptsApi.listObjectionTypes(),
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });
    const map = useMemo(() => {
        const m = { ...OBJECTION_TYPE_LABELS };
        for (const t of (types || []))
            m[t.code] = t.label;
        return m;
    }, [types]);
    return useCallback((type) => (!type ? 'Возражение' : (map[type] || type)), [map]);
}
function makeSellBadge(kind) {
    const noRulesTitle = kind === 'upsell'
        ? 'Правила апсейла не настроены для этого скрипта — система не знает, что считать апсейлом. Добавьте правила в разделе Скрипты.'
        : 'Правила кросс-сейла не настроены — система не знает, что считать кросс-сейлом. Добавьте правила в разделе Скрипты.';
    return function Badge({ analysis }) {
        if (analysis.status === 'complete' || analysis.status === 'partial')
            return (_jsx("span", { className: "tag tag-success", title: analysis.status === 'partial' && analysis.missed.length
                    ? `Упомянуто ${analysis.matched} из ${analysis.total}. Пропущено: ${analysis.missed.join(', ')}`
                    : `Упомянуто ${analysis.matched} из ${Math.max(analysis.total, analysis.matched)}`, children: "\u0414\u0430" }));
        if (analysis.status === 'missed')
            return _jsx("span", { className: "tag tag-danger", children: "\u041D\u0435\u0442" });
        return (_jsx("span", { className: "tag tag-neutral", title: noRulesTitle, style: { cursor: 'help' }, children: "\u041F\u0440\u0430\u0432\u0438\u043B \u043D\u0435\u0442" }));
    };
}
const SellBadge = makeSellBadge('upsell');
const CrossSellBadge = makeSellBadge('crosssell');
function HighlightLegend() {
    return (_jsxs("div", { className: "hl-legend", children: [_jsx("span", { className: "hl-pill hl-pill--script", children: "\u041F\u043E \u0442\u0435\u043A\u0441\u0442\u0443" }), _jsx("span", { className: "hl-pill hl-pill--paraphrased", children: "\u0421\u0432\u043E\u0438\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438" }), _jsx("span", { className: "hl-pill hl-pill--upsell", children: "\u0410\u043F\u0441\u0435\u0439\u043B" }), _jsx("span", { className: "hl-pill hl-pill--crosssell", children: "\u041A\u0440\u043E\u0441\u0441-\u0441\u0435\u0439\u043B" }), _jsx("span", { className: "hl-pill hl-pill--objection", children: "\u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435" })] }));
}
// ─── Pipeline status badge ────────────────────────────────────────────────────
function PipelineStatus({ status }) {
    if (status === 'processing')
        return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }, children: [_jsx("span", { style: { width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', animation: 'viq-pulse 1.4s ease-in-out infinite' } }), "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u0431\u0430\u0446\u0438\u044F..."] }));
    if (status === 'transcribed')
        return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: 'rgba(99,102,241,0.12)', color: '#6366F1' }, children: [_jsx("span", { style: { width: 7, height: 7, borderRadius: '50%', background: '#6366F1', display: 'inline-block', animation: 'viq-pulse 1.4s ease-in-out 0.3s infinite' } }), "\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442\u0441\u044F..."] }));
    if (status === 'failed')
        return (_jsx("span", { style: { padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }, children: "\u2715 \u041E\u0448\u0438\u0431\u043A\u0430" }));
    return null;
}
// ─── Detailed card for in-progress recording ─────────────────────────────────
function RecordingDetail({ recording }) {
    const status = recording.status;
    const sellerName = recording.seller_name || '—';
    const sellerColorKey = recording.seller_id || recording.seller_name || '';
    const storeName = recording.store_name || '—';
    const dateObj = recording.started_at ? new Date(recording.started_at) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const timeStr = dateObj ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    const mins = Math.floor((recording.duration_seconds || 0) / 60);
    const secs = (recording.duration_seconds || 0) % 60;
    // Pipeline steps based on status progression
    // processing → transcribed → diarized → analyzed
    const isFailed = status === 'failed';
    const isDiarized = ['diarized', 'analyzed'].includes(status);
    const isAnalyzed = status === 'analyzed';
    const steps = [
        { key: 'upload', label: 'Загрузка файла', done: true },
        { key: 'transcribe', label: 'Транскрибация (Whisper)', done: status !== 'processing' },
        { key: 'diarize', label: 'Распределение ролей', done: isDiarized },
        { key: 'analyze', label: 'Анализ соответствия скрипту', done: isAnalyzed },
    ];
    const currentStep = status === 'processing' ? 'transcribe'
        : status === 'transcribed' ? 'diarize'
            : status === 'diarized' ? 'analyze'
                : null;
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 20 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { style: { width: 44, height: 44, borderRadius: '50%', background: avatarColorFor(sellerColorKey), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16, flexShrink: 0 }, children: sellerName[0]?.toUpperCase() || '?' }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', fontSize: 15 }, children: sellerName }), _jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }, children: storeName })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsxs("span", { className: "tag tag-neutral", children: ["\uD83D\uDCC5 ", dateStr, ", ", timeStr] }), recording.duration_seconds
                        ? _jsxs("span", { className: "tag tag-neutral", children: ["\u23F1 ", mins, ":", String(secs).padStart(2, '0')] })
                        : _jsx("span", { className: "tag tag-neutral", style: { color: 'var(--text-muted)' }, children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F..." }), recording.file_size_bytes && (_jsxs("span", { className: "tag tag-neutral", children: ["\uD83D\uDCBE ", (recording.file_size_bytes / 1024 / 1024).toFixed(1), " \u041C\u0411"] }))] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 12, fontSize: 14 }, children: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 0 }, children: steps.map((step, i) => {
                            const isActive = step.key === currentStep && !isFailed;
                            const isFail = isFailed && step.key === currentStep;
                            const isDone = step.done && !isFailed;
                            const isPending = !step.done && step.key !== currentStep;
                            return (_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 12 }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }, children: [_jsxs("div", { style: {
                                                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: isDone ? 'var(--success)' : isActive ? '#6366F1' : isFail ? 'var(--danger)' : 'var(--border)',
                                                    color: (isDone || isActive || isFail) ? 'white' : 'var(--text-muted)',
                                                    fontSize: 13, fontWeight: 700,
                                                }, children: [isDone && _jsx(CheckCircle, { size: 14 }), isActive && _jsx(Loader, { size: 14, style: { animation: 'viq-spin 1s linear infinite' } }), isFail && _jsx(AlertCircle, { size: 14 }), isPending && _jsx(Clock, { size: 14 })] }), i < steps.length - 1 && (_jsx("div", { style: { width: 2, flex: 1, minHeight: 20, background: isDone ? 'var(--success)' : 'var(--border)', margin: '2px 0' } }))] }), _jsx("div", { style: { paddingBottom: i < steps.length - 1 ? 16 : 0, paddingTop: 3 }, children: _jsxs("div", { style: {
                                                fontSize: 14, fontWeight: isActive ? 600 : 400,
                                                color: isDone ? 'var(--text)' : isActive ? '#6366F1' : isFail ? 'var(--danger)' : 'var(--text-muted)',
                                            }, children: [step.label, isActive && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }, children: "\u2014 \u0432 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435" }), isDone && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--success)' }, children: "\u2014 \u0433\u043E\u0442\u043E\u0432\u043E" }), isFail && _jsx("span", { style: { marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--danger)' }, children: "\u2014 \u043E\u0448\u0438\u0431\u043A\u0430" })] }) })] }, step.key));
                        }) })] }), isFailed && recording.error_message && (_jsx("div", { style: { padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 13 }, children: recording.error_message })), !isFailed && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }, children: "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0435 5 \u0441\u0435\u043A\u0443\u043D\u0434 \u2014 \u0441\u0442\u0430\u0442\u0443\u0441 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438." }))] }));
}
// ─── Fulltext script coverage (блочное покрытие полнотекстового скрипта) ─────
const BLOCK_STATUS_META = {
    spoken: { icon: '✓', cls: 'done', label: 'произнесён по тексту' },
    paraphrased: { icon: '~', cls: 'partial', label: 'своими словами' },
    missed: { icon: '✕', cls: 'missed', label: 'пропущен' },
    // Ситуация не возникла — блок закономерно не нужен, не штрафуем (нейтрально)
    not_applicable: { icon: '–', cls: 'na', label: 'не требовался' },
};
function FulltextCoverage({ scriptResult, score, sColor, shortName }) {
    const [openBlock, setOpenBlock] = useState(null);
    const blocks = scriptResult.block_results || [];
    // Знаменатель — блоки, которые реально требовались (без not_applicable):
    // обязательные всегда + ситуативные, чья ситуация возникла
    const required = blocks.filter(b => b.status !== 'not_applicable');
    const okCount = required.filter(b => b.status === 'spoken' || b.status === 'paraphrased').length;
    const naCount = blocks.length - required.length;
    return (_jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 4 }, title: scriptResult.script_name || '', children: ["\u041F\u043E\u043A\u0440\u044B\u0442\u0438\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u0430", shortName ? ` («${shortName}»)` : '', " \u2014 ", score, "%"] }), _jsxs("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }, children: ["\u041F\u0440\u043E\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043E ", okCount, " \u0438\u0437 ", required.length, " \u043D\u0443\u0436\u043D\u044B\u0445 \u0431\u043B\u043E\u043A\u043E\u0432", naCount > 0 && _jsxs("span", { children: [" \u00B7 ", naCount, " \u043D\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043B\u043E\u0441\u044C"] })] }), _jsx("div", { className: "progress-bar", style: { marginBottom: 12 }, children: _jsx("div", { className: `progress-bar-fill ${sColor}`, style: { width: `${score}%` } }) }), _jsx("ul", { className: "checklist", children: blocks.map((b) => {
                    const meta = BLOCK_STATUS_META[b.status] || BLOCK_STATUS_META.missed;
                    const isOpen = openBlock === b.block_id;
                    return (_jsxs("li", { className: "checklist-item", style: { flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }, onClick: () => setOpenBlock(isOpen ? null : b.block_id), children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%' }, children: [_jsx("div", { className: `check-icon ${meta.cls}`, children: meta.icon }), _jsxs("span", { className: `checklist-text ${meta.cls}`, style: { flex: 1 }, children: [b.title, !b.is_mandatory && (_jsx("span", { style: { marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }, children: "\u00B7 \u0441\u0438\u0442\u0443\u0430\u0442\u0438\u0432\u043D\u044B\u0439" }))] }), _jsx("span", { className: `checklist-score ${meta.cls}`, style: { whiteSpace: 'nowrap' }, children: meta.label })] }), isOpen && (_jsxs("div", { style: {
                                    marginTop: 8, marginLeft: 30, padding: '10px 12px',
                                    background: 'var(--bg)', borderRadius: 'var(--radius)', fontSize: 12.5, lineHeight: 1.5,
                                }, children: [b.text && (_jsxs("div", { style: { color: 'var(--text-secondary)' }, children: [_jsx("span", { style: { fontWeight: 600, color: 'var(--text-muted)', fontSize: 11 }, children: "\u0421\u041A\u0420\u0418\u041F\u0422: " }), b.text] })), b.quote && (_jsxs("div", { style: { marginTop: 6, color: 'var(--success)' }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 11 }, children: "\u0421\u041A\u0410\u0417\u0410\u041D\u041E: " }), "\u00AB", b.quote, "\u00BB"] })), b.comment && (_jsx("div", { style: { marginTop: 6, color: 'var(--text-muted)', fontStyle: 'italic' }, children: b.comment }))] }))] }, b.block_id));
                }) })] }));
}
// ─── Full conversation detail (analyzed) ─────────────────────────────────────
function ConversationDetail({ conversationId }) {
    const objectionTypeLabel = useObjectionTypeLabel();
    const { data, isLoading } = useQuery({
        queryKey: ['conversation-detail', conversationId],
        queryFn: () => dashboardApi.getConversationDetail(conversationId),
    });
    const { data: upsellRules } = useQuery({
        queryKey: ['upsell-rules-all'],
        queryFn: () => scriptsApi.listUpsellRules(),
    });
    const { data: crossSellRules } = useQuery({
        queryKey: ['cross-sell-rules-all'],
        queryFn: () => scriptsApi.listCrossSellRules(),
    });
    const [audioTime, setAudioTime] = useState(0);
    const [audioUrl, setAudioUrl] = useState();
    // ─── Безопасные derived-значения для хуков ниже (работают и при !data) ──────
    const c = data?.conversation || data || {};
    const transcript = data?.transcript || {};
    const segments = transcript.segments || c.segments || data?.segments || [];
    const scriptResults = c.script_results || data?.script_results || [];
    const objections = c.objections || data?.objections || [];
    const storeId = c.store_id;
    const sellerId = c.seller_id;
    // LLM-результаты по апсейл/кросс-сейл из бэкенда: список объектов с цитатами для подсветки.
    const upsellResults = Array.isArray(c.upsell_results) ? c.upsell_results : [];
    const crosssellResults = Array.isArray(c.crosssell_results) ? c.crosssell_results : [];
    // Анализ кросс-сейла предпочитает LLM-результат с бэка; для старых разговоров (где
    // crosssell_results=NULL) фолбэк на клиентский подстрочный матч по правилам.
    const crossSellAnalysis = useMemo(() => {
        if (c.has_crosssell !== null && c.has_crosssell !== undefined && crosssellResults.length > 0) {
            // Собираем агрегаты из LLM-результата.
            let total = 0, matched = 0;
            const missed = [];
            for (const r of crosssellResults) {
                const required = r.required_offers || [];
                const offered = r.offered_items || [];
                total += required.length;
                matched += offered.length;
                for (const m of (r.missed_items || []))
                    missed.push(m);
            }
            let status = 'no-trigger';
            if (crosssellResults.length > 0) {
                if (total === 0)
                    status = 'complete';
                else if (matched === total)
                    status = 'complete';
                else if (matched === 0)
                    status = 'missed';
                else
                    status = 'partial';
            }
            return { triggered: true, matched, total, missed, status };
        }
        return analyzeSell(crossSellRules, segments, storeId, sellerId);
    }, [c.has_crosssell, crosssellResults, crossSellRules, segments, storeId, sellerId]);
    // Анализ апсейла — симметрично кросс-сейлу: предпочитаем LLM-результат с бэка,
    // фолбэк на клиентский матч по правилам. Раньше для апсейла фолбэка не было,
    // поэтому при has_upsell=null показывалось "Правил нет", даже когда триггеры
    // и офферы реально были в транскрипте.
    const upsellAnalysis = useMemo(() => {
        if (c.has_upsell !== null && c.has_upsell !== undefined && upsellResults.length > 0) {
            let total = 0, matched = 0;
            const missed = [];
            for (const r of upsellResults) {
                const required = r.required_offers || [];
                const offered = r.offered_items || [];
                total += required.length;
                matched += offered.length;
                for (const m of (r.missed_items || []))
                    missed.push(m);
            }
            let status = 'no-trigger';
            if (upsellResults.length > 0) {
                if (total === 0)
                    status = 'complete';
                else if (matched === total)
                    status = 'complete';
                else if (matched === 0)
                    status = 'missed';
                else
                    status = 'partial';
            }
            return { triggered: true, matched, total, missed, status };
        }
        return analyzeSell(upsellRules, segments, storeId, sellerId);
    }, [c.has_upsell, upsellResults, upsellRules, segments, storeId, sellerId]);
    const highlightRules = useMemo(() => {
        const rules = [];
        for (const sr of scriptResults) {
            // Полнотекстовый скрипт: подсвечиваем цитаты оператора, подтверждающие блоки.
            // spoken → зелёный (по тексту), paraphrased → жёлтый (своими словами).
            for (const b of (sr.block_results || [])) {
                const quote = (b.quote || '').trim();
                if (quote.length < 3 || b.status === 'missed' || b.status === 'not_applicable')
                    continue;
                rules.push({
                    text: quote,
                    kind: b.status === 'spoken' ? 'script-done' : 'script-partial',
                    tooltip: `Блок «${b.title}» — ${b.status === 'spoken' ? 'произнесён по тексту' : 'своими словами'}`,
                });
            }
            for (const step of (sr.step_scores || sr.steps || [])) {
                const evidence = (step.evidence || '').trim();
                if (!evidence)
                    continue;
                const rawScore = Number(step.score ?? 0);
                const isDetected = step.detected !== false && (rawScore > 0 || step.detected);
                // Зелёным подсвечиваем только этапы, реально выполненные (≥70%).
                // Частично выполненные не подсвечиваем — иначе вводит в заблуждение.
                if (!isDetected || rawScore < 70)
                    continue;
                rules.push({
                    text: evidence,
                    kind: 'script-done',
                    tooltip: `Этап «${step.step_name || step.name}» — выполнен (${Math.round(rawScore)}%)`,
                });
            }
        }
        for (const obj of objections) {
            const raw = (obj?.raw_text || '').trim();
            if (raw.length < 3)
                continue;
            rules.push({
                text: raw,
                kind: obj.is_resolved ? 'objection-resolved' : 'objection-unresolved',
                tooltip: `Возражение${obj.type ? `: ${obj.type}` : ''} — ${obj.is_resolved ? 'закрыто' : 'не закрыто'}`,
            });
        }
        // Цитаты из LLM-результатов апсейла/кросс-сейла — LLM уже сам устойчив к опечаткам
        // транскрибации и возвращает ДОСЛОВНЫЕ цитаты из текста. Подсвечиваем их.
        const pushSellQuotes = (results, kind) => {
            const triggerKind = kind === 'upsell' ? 'upsell-trigger' : 'crosssell-trigger';
            const offerKind = kind === 'upsell' ? 'upsell-offer' : 'crosssell-offer';
            const label = kind === 'upsell' ? 'Апсейл' : 'Кросс-сейл';
            for (const r of results) {
                const product = r.trigger_product || '';
                for (const q of (r.trigger_quotes || [])) {
                    if (typeof q === 'string' && q.trim().length >= 3) {
                        rules.push({ text: q, kind: triggerKind, tooltip: `${label}: триггер «${product}»` });
                    }
                }
                const offerQuotes = r.offer_quotes || {};
                for (const offer in offerQuotes) {
                    for (const q of (offerQuotes[offer] || [])) {
                        if (typeof q === 'string' && q.trim().length >= 3) {
                            rules.push({ text: q, kind: offerKind, tooltip: `${label}: предложение «${offer}»` });
                        }
                    }
                }
            }
        };
        if (upsellResults.length > 0) {
            pushSellQuotes(upsellResults, 'upsell');
        }
        else {
            // Фолбэк для старых разговоров без LLM-цитат — берём правила и ищем подстроку.
            rules.push(...highlightRulesForSell(upsellRules, storeId, 'upsell', sellerId));
        }
        if (crosssellResults.length > 0) {
            pushSellQuotes(crosssellResults, 'crosssell');
        }
        else {
            rules.push(...highlightRulesForSell(crossSellRules, storeId, 'crosssell', sellerId));
        }
        return rules;
    }, [scriptResults, objections, upsellResults, crosssellResults, upsellRules, crossSellRules, storeId]);
    const recordingId = data?.conversation?.recording_id || data?.recording_id;
    useEffect(() => {
        if (!recordingId)
            return;
        let revokedUrl;
        let cancelled = false;
        recorderApi.getAudioBlobUrl(recordingId)
            .then(url => {
            if (cancelled) {
                URL.revokeObjectURL(url);
                return;
            }
            revokedUrl = url;
            setAudioUrl(url);
        })
            .catch(() => { });
        return () => {
            cancelled = true;
            if (revokedUrl)
                URL.revokeObjectURL(revokedUrl);
        };
    }, [recordingId]);
    if (isLoading)
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    if (!data)
        return null;
    const sellerName = c.seller_name || c.seller_id || '?';
    const storeName = c.store_name || c.store_id || '';
    const mins = Math.floor((c.duration_seconds || 0) / 60);
    const secs = (c.duration_seconds || 0) % 60;
    const dateSource = c.analyzed_at || c.recorded_at || c.session_date || '';
    const dateStr = dateSource ? new Date(dateSource).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const timeStr = dateSource ? new Date(dateSource).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    const overallScore = Math.round(c.overall_score || 0);
    const sellerColorKey = c.seller_id || sellerName;
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: [_jsx("div", { className: "avatar", style: { background: avatarColorFor(sellerColorKey), width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }, children: sellerName[0].toUpperCase() }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', fontSize: 15 }, children: sellerName }), _jsx("div", { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }, children: storeName })] }), _jsxs("div", { style: { textAlign: 'right' }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: dateStr }), _jsxs("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: [timeStr, " \u00B7 ", mins, ":", String(secs).padStart(2, '0')] })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx(OutcomeTag, { outcome: c.outcome }), c.call_direction && (_jsxs("span", { className: "tag tag-neutral", style: { display: 'inline-flex', alignItems: 'center', gap: 5 }, children: [_jsx(DirectionIcon, { direction: c.call_direction }), c.call_direction === 'inbound' ? 'Входящий' : 'Исходящий'] })), c.client_phone && (_jsxs("span", { className: "tag tag-neutral", style: { display: 'inline-flex', alignItems: 'center', gap: 5 }, children: [_jsx(Phone, { size: 12 }), " ", c.client_phone] })), c.topic && _jsx("span", { className: "tag tag-neutral", children: c.topic }), c.compliance_ok !== undefined && (_jsxs("span", { className: `tag ${c.compliance_ok ? 'tag-success' : 'tag-danger'}`, children: ["\u041A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441: ", c.compliance_ok ? 'OK' : 'Нарушение'] }))] }), c.talk_ratio !== null && c.talk_ratio !== undefined && (_jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }, children: [
                    {
                        label: 'Речь сотрудника',
                        value: `${Math.round(c.talk_ratio * 100)}%`,
                        hint: 'Доля времени речи сотрудника. Ориентир для продаж — 40–60%',
                        warn: c.talk_ratio > 0.75 || c.talk_ratio < 0.25,
                    },
                    {
                        label: 'Перебивания',
                        value: String(c.interruptions_count ?? '—'),
                        hint: 'Сколько раз стороны перебивали друг друга',
                        warn: (c.interruptions_count ?? 0) >= 5,
                    },
                    {
                        label: 'Макс. монолог',
                        value: c.longest_monologue_seconds != null ? `${c.longest_monologue_seconds}с` : '—',
                        hint: 'Самый длинный непрерывный монолог сотрудника',
                        warn: (c.longest_monologue_seconds ?? 0) >= 90,
                    },
                    {
                        label: 'Тишина',
                        value: c.silence_ratio != null ? `${Math.round(c.silence_ratio * 100)}%` : '—',
                        hint: 'Доля пауз без речи от длительности разговора',
                        warn: (c.silence_ratio ?? 0) >= 0.3,
                    },
                ].map((m) => (_jsxs("div", { title: m.hint, style: {
                        padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)',
                        textAlign: 'center', cursor: 'help',
                    }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 700, color: m.warn ? 'var(--danger)' : 'var(--text)' }, children: m.value }), _jsx("div", { style: { fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }, children: m.label })] }, m.label))) })), scriptResults.map((sr, i) => {
                const score = Math.round(sr.script_score || sr.total_score || 0);
                const sColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
                const shortName = (sr.script_short_name || '').trim();
                // Полнотекстовый скрипт: вместо этапов показываем покрытие по блокам
                if (sr.script_type === 'fulltext' && Array.isArray(sr.block_results) && sr.block_results.length > 0) {
                    return (_jsx(FulltextCoverage, { scriptResult: sr, score: score, sColor: sColor, shortName: shortName }, i));
                }
                return (_jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 8 }, title: sr.script_name || '', children: ["\u0421\u043A\u043E\u0440\u0438\u043D\u0433 \u0441\u043A\u0440\u0438\u043F\u0442\u0430", shortName ? ` («${shortName}»)` : '', " \u2014 ", score, "%"] }), _jsx("div", { className: "progress-bar", style: { marginBottom: 12 }, children: _jsx("div", { className: `progress-bar-fill ${sColor}`, style: { width: `${score}%` } }) }), _jsx("ul", { className: "checklist", children: (sr.step_scores || sr.steps || []).map((step, j) => {
                                const rawScore = Number(step.score ?? 0);
                                const stepScore = Math.round(rawScore);
                                const isDetected = step.detected !== false && (rawScore > 0 || step.detected);
                                // ≥70 — выполнен, 40-69 — частично, <40 / не detected — провален
                                const status = !isDetected || rawScore < 40 ? 'missed'
                                    : rawScore < 70 ? 'partial'
                                        : 'done';
                                const icon = status === 'done' ? '✓' : status === 'partial' ? '~' : '✕';
                                return (_jsxs("li", { className: "checklist-item", children: [_jsx("div", { className: `check-icon ${status}`, children: icon }), _jsx("span", { className: `checklist-text ${status}`, children: step.step_name || step.name }), _jsxs("span", { className: `checklist-score ${status}`, children: [stepScore, "%"] })] }, j));
                            }) })] }, i));
            }), objections.length > 0 && (() => {
                const seen = new Set();
                const uniqueTypes = [];
                for (const o of objections) {
                    const t = (o.type || '').toString();
                    if (t && !seen.has(t)) {
                        seen.add(t);
                        uniqueTypes.push(t);
                    }
                }
                if (!uniqueTypes.length)
                    return null;
                return (_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 8 }, children: "\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0435 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F" }), _jsx("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: uniqueTypes.map((t) => (_jsx("span", { className: "tag tag-danger", children: objectionTypeLabel(t) }, t))) })] }));
            })(), _jsxs("div", { className: "sell-summary", children: [_jsxs("div", { className: "sell-summary-item", children: [_jsx("div", { className: "sell-summary-label", children: "\u0410\u043F\u0441\u0435\u0439\u043B" }), _jsx(SellBadge, { analysis: upsellAnalysis })] }), _jsxs("div", { className: "sell-summary-item", children: [_jsx("div", { className: "sell-summary-label", children: "\u041A\u0440\u043E\u0441\u0441-\u0441\u0435\u0439\u043B" }), _jsx(CrossSellBadge, { analysis: crossSellAnalysis })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)', marginBottom: 8 }, children: "\u0410\u0443\u0434\u0438\u043E\u0437\u0430\u043F\u0438\u0441\u044C" }), _jsx(AudioPlayer, { src: audioUrl, duration: c.duration_seconds, onTimeUpdate: setAudioTime })] }), segments.length > 0 && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }, children: [_jsx("div", { style: { fontWeight: 600, color: 'var(--text)' }, children: "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442" }), _jsx(HighlightLegend, {})] }), _jsx("div", { className: "transcript", children: segments.map((seg, i) => {
                            const role = (seg.speaker_role || '').toLowerCase();
                            const isSeller = role === 'seller';
                            const isClient = role === 'client' || role === 'customer';
                            const startSec = seg.start_time || (seg.start_ms ?? 0) / 1000;
                            const m = Math.floor(startSec / 60);
                            const s = Math.floor(startSec % 60);
                            const timeStr = `${m}:${String(s).padStart(2, '0')}`;
                            const isCall = !!c.call_direction || (c.source || '').startsWith('call');
                            const speakerLabel = isSeller ? (isCall ? 'Оператор' : 'Продавец') : isClient ? 'Клиент' : '—';
                            const speakerClass = isSeller ? 'seller' : isClient ? 'client' : 'unknown';
                            // Апсейл/кросс-сейл — действия продавца, поэтому их подсветку (триггер и
                            // предложение) показываем только в репликах продавца. У клиента триггер-продукт
                            // может прозвучать (он сам упомянул товар), но это не работа менеджера —
                            // согласуется с analyzeSell, который тоже считает только речь продавца.
                            // Возражения и шаги скрипта не трогаем — они валидны для обеих сторон.
                            const segRules = isSeller
                                ? highlightRules
                                : highlightRules.filter((r) => !r.kind.startsWith('upsell-') && !r.kind.startsWith('crosssell-'));
                            return (_jsxs("div", { className: "transcript-line", children: [_jsx("span", { className: "transcript-time", children: timeStr }), _jsx("span", { className: `transcript-speaker ${speakerClass}`, children: speakerLabel }), _jsx("span", { className: "transcript-text", children: highlightSegmentText(seg.text, segRules) })] }, i));
                        }) })] })), _jsxs("div", { style: { display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }, children: [_jsx("button", { className: "btn btn-outline btn-sm", children: "\u0412 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435" }), _jsx("button", { className: "btn btn-outline btn-sm", children: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442" }), _jsx("button", { className: "btn btn-outline btn-sm", style: { color: 'var(--danger)' }, children: "\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435" })] })] }));
}
export function ConversationsPage() {
    const { period } = useOutletContext();
    const terms = useTerms();
    const [searchParams, setSearchParams] = useSearchParams();
    const [page, setPage] = useState(1);
    const [selectedConvId, setSelectedConvId] = useState(() => searchParams.get('conv'));
    const [selectedRec, setSelectedRec] = useState(null);
    useEffect(() => {
        const conv = searchParams.get('conv');
        if (conv && conv !== selectedConvId)
            setSelectedConvId(conv);
        if (!conv && selectedConvId)
            setSelectedConvId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);
    const [showUpload, setShowUpload] = useState(false);
    const [showTranscriptUpload, setShowTranscriptUpload] = useState(false);
    const [showCallUpload, setShowCallUpload] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [sort, setSort] = useState({ by: 'date', dir: 'desc' });
    const [filters, setFilters] = useState({
        store_id: '', seller_id: '', outcome: '', direction: '', source: '',
        score_min: undefined,
        score_max: undefined,
    });
    const toggleSort = useCallback((by) => {
        setSort(prev => prev.by === by
            ? { by, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
            : { by, dir: by === 'date' || by === 'duration' ? 'desc' : 'asc' });
    }, []);
    const { data: conversations, dataUpdatedAt: convAt } = useQuery({
        queryKey: ['conversations', page, filters, period],
        queryFn: () => dashboardApi.getConversations({
            page, limit: 20,
            store_id: filters.store_id || undefined,
            seller_id: filters.seller_id || undefined,
            outcome: filters.outcome || undefined,
            direction: filters.direction || undefined,
            source: filters.source || undefined,
            score_min: filters.score_min,
            score_max: filters.score_max,
            period,
        }),
        refetchInterval: 5000,
    });
    const { data: recordingsData, dataUpdatedAt: recAt } = useQuery({
        queryKey: ['recordings-status'],
        queryFn: () => recorderApi.getRecordings({ limit: 50 }),
        refetchInterval: 5000,
    });
    const { data: stores } = useQuery({
        queryKey: ['admin-stores'],
        queryFn: () => adminApi.getStores(),
    });
    useEffect(() => {
        if (convAt || recAt)
            setLastUpdated(new Date());
    }, [convAt, recAt]);
    const analyzedIds = new Set((conversations?.items || []).map((c) => c.recording_id).filter(Boolean));
    const pendingRows = (recordingsData?.items || []).filter((r) => !analyzedIds.has(r.id));
    const allRows = [
        ...pendingRows.map((r) => ({
            _type: 'pending',
            _date: r.started_at ? new Date(r.started_at).getTime() : 0,
            _name: (r.seller_name || '').toLowerCase(),
            _duration: r.duration_seconds || 0,
            _store: (r.store_name || '').toLowerCase(),
            ...r,
        })),
        ...(conversations?.items || []).map((c) => ({
            _type: 'analyzed',
            _date: new Date(c.analyzed_at || c.recorded_at || c.session_date || 0).getTime(),
            _name: (c.seller_name || '').toLowerCase(),
            _duration: c.duration_seconds || 0,
            _store: (c.store_name || '').toLowerCase(),
            ...c,
        })),
    ];
    const sortedRows = [...allRows].sort((a, b) => {
        let v = 0;
        if (sort.by === 'date')
            v = a._date - b._date;
        else if (sort.by === 'name')
            v = a._name.localeCompare(b._name, 'ru');
        else if (sort.by === 'duration')
            v = a._duration - b._duration;
        else if (sort.by === 'store')
            v = a._store.localeCompare(b._store, 'ru');
        return sort.dir === 'asc' ? v : -v;
    });
    const handleScoreFilter = (v) => {
        if (v === '80+')
            setFilters(p => ({ ...p, score_min: 80, score_max: undefined }));
        else if (v === '60-79')
            setFilters(p => ({ ...p, score_min: 60, score_max: 79 }));
        else if (v === '<60')
            setFilters(p => ({ ...p, score_min: undefined, score_max: 59 }));
        else
            setFilters(p => ({ ...p, score_min: undefined, score_max: undefined }));
        setPage(1);
    };
    const lastUpdatedStr = lastUpdated
        ? lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;
    // ─── Filter metadata ───────────────────────────────────────────────────────
    const scoreValue = filters.score_min === 80 ? '80+' :
        filters.score_min === 60 && filters.score_max === 79 ? '60-79' :
            filters.score_max === 59 ? '<60' : '';
    const sortLabels = {
        date_desc: 'Сначала новые',
        date_asc: 'Сначала старые',
        name_asc: 'Имя А→Я',
        name_desc: 'Имя Я→А',
        duration_desc: 'Длинные сначала',
        duration_asc: 'Короткие сначала',
        store_asc: 'Магазин А→Я',
        store_desc: 'Магазин Я→А',
    };
    const sortKey = `${sort.by}_${sort.dir}`;
    const sortActive = sortKey !== 'date_desc';
    const hasActiveFilters = !!(filters.store_id || filters.outcome || filters.direction || filters.source || scoreValue || sortActive);
    const resetAll = () => {
        setFilters({ store_id: '', seller_id: '', outcome: '', direction: '', source: '', score_min: undefined, score_max: undefined });
        setSort({ by: 'date', dir: 'desc' });
        setPage(1);
    };
    const drawerTitle = selectedConvId
        ? `Разговор #${selectedConvId.slice(0, 8)}`
        : selectedRec
            ? `Запись #${String(selectedRec.id).slice(0, 8)}`
            : '';
    return (_jsxs("div", { children: [_jsx("style", { children: `
        @keyframes viq-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.8)} }
        @keyframes viq-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      ` }), _jsxs("div", { className: "filter-toolbar fade-in", children: [_jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: (stores?.items || []).map((s) => ({ id: s.id, label: s.name })), selected: filters.store_id ? [filters.store_id] : [''], onChange: (ids) => { setFilters(p => ({ ...p, store_id: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: terms.allStores }, placeholder: terms.allStores }) }), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: Object.entries(terms.isTelephony ? TELEPHONY_OUTCOME_LABELS : OUTCOME_LABELS).map(([k, l]) => ({ id: k, label: l })), selected: filters.outcome ? [filters.outcome] : [''], onChange: (ids) => { setFilters(p => ({ ...p, outcome: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: 'Все исходы' }, placeholder: "\u0412\u0441\u0435 \u0438\u0441\u0445\u043E\u0434\u044B" }) }), terms.isTelephony && (_jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: [
                                { id: 'inbound', label: 'Входящие' },
                                { id: 'outbound', label: 'Исходящие' },
                            ], selected: filters.direction ? [filters.direction] : [''], onChange: (ids) => { setFilters(p => ({ ...p, direction: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: 'Все направления' }, placeholder: "\u0412\u0441\u0435 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F" }) })), terms.isTelephony && (_jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: [
                                { id: 'calls', label: 'Звонки (все)' },
                                { id: 'call_webhook', label: 'Звонки из АТС' },
                                { id: 'call_manual', label: 'Звонки (вручную)' },
                                { id: 'manual', label: 'Загруженное аудио' },
                                { id: 'transcript', label: 'Транскрипты' },
                            ], selected: filters.source ? [filters.source] : [''], onChange: (ids) => { setFilters(p => ({ ...p, source: ids[0] === '' ? '' : ids[0] })); setPage(1); }, prependOption: { id: '', label: 'Все источники' }, placeholder: "\u0412\u0441\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438" }) })), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: [
                                { id: '80+', label: 'Скоринг 80%+' },
                                { id: '60-79', label: 'Скоринг 60–79%' },
                                { id: '<60', label: 'Скоринг < 60%' },
                            ], selected: scoreValue ? [scoreValue] : [''], onChange: (ids) => handleScoreFilter(ids[0] === '' ? '' : ids[0]), prependOption: { id: '', label: 'Любой скоринг' }, placeholder: "\u041B\u044E\u0431\u043E\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }) }), _jsx("div", { className: "filter-cell", children: _jsx(MultiSelect, { single: true, options: Object.entries(sortLabels).map(([k, l]) => ({ id: k, label: l })), selected: [sortKey], onChange: (ids) => {
                                const [by, dir] = (ids[0] || 'date_desc').split('_');
                                setSort({ by, dir });
                            }, placeholder: "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430" }) }), hasActiveFilters && (_jsxs("button", { className: "filter-clear", onClick: resetAll, title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B", children: [_jsx(X, { size: 12 }), " \u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C"] })), _jsx("div", { style: { flex: 1 } }), _jsxs("div", { className: "filter-meta", children: [_jsx("span", { className: "filter-meta-strong", children: (conversations?.total || 0) + pendingRows.length }), _jsx("span", { children: "\u0437\u0430\u043F\u0438\u0441\u0435\u0439" }), lastUpdatedStr && (_jsxs(_Fragment, { children: [_jsx("span", { className: "filter-meta-divider" }), _jsx("span", { className: "live-dot" }), _jsxs("span", { children: ["\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E ", lastUpdatedStr] })] }))] }), _jsxs("button", { className: "btn btn-sm", onClick: () => setShowTranscriptUpload(true), title: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0447\u0435\u043D\u043D\u044B\u0439 \u0434\u0438\u0430\u043B\u043E\u0433 \u2014 \u0434\u043B\u044F \u0442\u0435\u0441\u0442\u043E\u0432 \u0441\u043A\u043E\u0440\u0438\u043D\u0433\u0430 \u0438 \u0430\u043F\u0441\u0435\u0439\u043B\u0430 \u0431\u0435\u0437 \u0430\u0443\u0434\u0438\u043E", style: { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }, children: [_jsx(FileText, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u0431\u0430\u0446\u0438\u0438"] }), _jsxs("button", { className: "btn btn-sm btn-primary-gradient", onClick: () => setShowUpload(true), children: [_jsx(Upload, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u0443\u0434\u0438\u043E"] }), terms.isTelephony && (_jsxs("button", { className: "btn btn-sm btn-primary-gradient", onClick: () => setShowCallUpload(true), title: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u043D\u043E\u0433\u043E \u0437\u0432\u043E\u043D\u043A\u0430 \u0441 \u043C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u043C\u0438 (\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435, \u043D\u043E\u043C\u0435\u0440 \u043A\u043B\u0438\u0435\u043D\u0442\u0430)", children: [_jsx(Phone, { size: 14 }), " \u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0432\u043E\u043D\u043E\u043A"] }))] }), _jsx(AudioUploadModal, { open: showUpload, onClose: () => setShowUpload(false), onUploadComplete: () => { } }), _jsx(TranscriptUploadModal, { open: showTranscriptUpload, onClose: () => setShowTranscriptUpload(false), onUploadComplete: () => { } }), _jsx(CallUploadModal, { open: showCallUpload, onClose: () => setShowCallUpload(false), onUploadComplete: () => { } }), _jsxs("div", { className: "card fade-in", children: [_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [['date', 'name', 'store', 'duration'].map(col => {
                                                const labels = { date: 'Дата и время', name: terms.seller, store: terms.store, duration: 'Длительность' };
                                                const active = sort.by === col;
                                                const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                                                return (_jsx("th", { onClick: () => toggleSort(col), style: { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }, children: _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [labels[col], _jsx(Icon, { size: 12, style: { opacity: active ? 1 : 0.3, color: active ? 'var(--primary)' : 'inherit' } })] }) }, col));
                                            }), _jsx("th", { children: "\u0422\u0435\u043C\u0430" }), _jsx("th", { style: { textAlign: 'center' }, children: "\u0421\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("th", { style: { textAlign: 'center' }, children: "\u0410\u043F\u0441\u0435\u0439\u043B" }), _jsx("th", { style: { textAlign: 'center' }, children: "\u041A\u0440\u043E\u0441\u0441-\u0441\u0435\u0439\u043B" }), _jsx("th", { style: { textAlign: 'center' }, children: "\u0418\u0441\u0445\u043E\u0434 / \u0421\u0442\u0430\u0442\u0443\u0441" })] }) }), _jsx("tbody", { children: sortedRows.map((row, idx) => {
                                        const dateObj = row._date ? new Date(row._date) : null;
                                        const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
                                        const timeStr = dateObj ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                                        const mins = Math.floor(row._duration / 60);
                                        const secs = row._duration % 60;
                                        const durStr = row._duration ? `${mins}:${String(secs).padStart(2, '0')}` : '—';
                                        if (row._type === 'pending') {
                                            const sellerName = row.seller_name || '—';
                                            return (_jsxs("tr", { onClick: () => { setSelectedRec(row); setSelectedConvId(null); }, style: { cursor: 'pointer', background: 'var(--bg)', opacity: .92,
                                                    outline: selectedRec?.id === row.id ? '1px solid var(--primary)' : undefined }, children: [_jsxs("td", { children: [dateStr, " ", _jsx("span", { style: { color: 'var(--text-muted)' }, children: timeStr })] }), _jsx("td", { children: _jsxs("div", { className: "seller-cell", children: [_jsx("div", { className: "avatar", style: { background: '#94A3B8' }, children: sellerName[0]?.toUpperCase() || '?' }), _jsx("div", { className: "name", children: sellerName })] }) }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: row.store_name || '—' }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: durStr }), _jsx("td", { children: "\u2014" }), _jsx("td", { style: { textAlign: 'center' }, children: "\u2014" }), _jsx("td", { style: { textAlign: 'center' }, children: "\u2014" }), _jsx("td", { style: { textAlign: 'center' }, children: "\u2014" }), _jsx("td", { style: { textAlign: 'center' }, children: _jsx(PipelineStatus, { status: row.status }) })] }, row.id));
                                        }
                                        const color = avatarColorFor(row.seller_id || row.seller_name);
                                        return (_jsxs("tr", { onClick: () => { setSelectedConvId(row.id); setSelectedRec(null); }, style: { cursor: 'pointer', background: selectedConvId === row.id ? 'var(--bg-active)' : undefined }, children: [_jsx("td", { children: _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, title: row.client_phone ? `${row.call_direction === 'inbound' ? 'Входящий' : 'Исходящий'} · ${row.client_phone}` : undefined, children: [row.call_direction && _jsx(DirectionIcon, { direction: row.call_direction }), dateStr, " ", _jsx("span", { style: { color: 'var(--text-muted)' }, children: timeStr })] }) }), _jsx("td", { children: _jsxs("div", { className: "seller-cell", children: [_jsx("div", { className: "avatar", style: { background: color }, children: (row.seller_name || '?')[0].toUpperCase() }), _jsx("div", { className: "name", children: row.seller_name || row.seller_id })] }) }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: row.store_name || row.store_id }), _jsx("td", { children: durStr }), _jsx("td", { style: { color: 'var(--text-secondary)' }, children: row.topic || '—' }), _jsx("td", { style: { textAlign: 'center' }, children: _jsx(ScoreBadge, { score: row.overall_score }) }), _jsx("td", { style: { textAlign: 'center' }, children: row.has_upsell === true
                                                        ? _jsx("span", { className: "tag tag-success", children: "\u0414\u0430" })
                                                        : _jsx("span", { className: "tag tag-danger", children: "\u041D\u0435\u0442" }) }), _jsx("td", { style: { textAlign: 'center' }, children: row.has_crosssell === true
                                                        ? _jsx("span", { className: "tag tag-success", children: "\u0414\u0430" })
                                                        : _jsx("span", { className: "tag tag-danger", children: "\u041D\u0435\u0442" }) }), _jsx("td", { style: { textAlign: 'center' }, children: _jsx(OutcomeTag, { outcome: row.outcome }) })] }, row.id));
                                    }) })] }) }), _jsxs("div", { style: { padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }, children: [_jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setPage(Math.max(1, page - 1)), disabled: page === 1, children: "\u2190 \u041D\u0430\u0437\u0430\u0434" }), _jsxs("span", { style: { margin: '0 16px', color: 'var(--text-muted)', fontSize: 13 }, children: ["\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 ", page] }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => setPage(page + 1), disabled: !conversations || conversations.items.length < 20, children: "\u0412\u043F\u0435\u0440\u0451\u0434 \u2192" })] })] }), _jsxs(Drawer, { isOpen: !!(selectedConvId || selectedRec), onClose: () => {
                    setSelectedConvId(null);
                    setSelectedRec(null);
                    if (searchParams.get('conv')) {
                        const next = new URLSearchParams(searchParams);
                        next.delete('conv');
                        setSearchParams(next, { replace: true });
                    }
                }, title: drawerTitle, children: [selectedConvId && _jsx(ConversationDetail, { conversationId: selectedConvId }), selectedRec && !selectedConvId && _jsx(RecordingDetail, { recording: selectedRec })] })] }));
}
