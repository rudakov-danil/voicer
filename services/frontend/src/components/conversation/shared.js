import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/* Общие части карточки разговора: справочники, резюме, покрытие блоков, история клиента,
   подсветки транскрипта и анализ допродажи. Используются страницей разговора и списком. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useCallback } from 'react';
import { PhoneIncoming, PhoneOutgoing, History, ArrowDown, Loader, RefreshCw, Sparkles } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { analyticsApi } from '@/api/analytics';
import { scriptsApi } from '@/api/scripts';
import { OutcomeTag } from '@/components/OutcomeTag';
import { ScoreBadge } from '@/components/ScoreBadge';
import { highlightRulesForSell, analyzeSell, } from '@/components/scripts/conversationHelpers';
export const OUTCOME_LABELS = {
    purchase: 'Покупка',
    deferred: 'Отложено',
    price_refusal: 'Отказ по цене',
    competitor: 'Ушёл к конкурентам',
    unknown: 'Не определён',
};
// Исходы звонков (телефония) — добавляются к фильтру для telephony-организаций
export const TELEPHONY_OUTCOME_LABELS = {
    purchase: 'Продажа / заявка',
    appointment: 'Встреча назначена',
    callback: 'Перезвон',
    deferred: 'Думает',
    refusal: 'Отказ',
    transfer: 'Перевод звонка',
    non_target: 'Нецелевой',
    voicemail: 'Недозвон',
    resolved: 'Вопрос решён',
    unknown: 'Не определён',
};
// Категории обращения (телефония) — для учёта нецелевых/сервисных звонков
export const CALL_CATEGORY_LABELS = {
    sales: 'Продажный',
    service: 'Сервисный',
    non_target: 'Нецелевой',
    other: 'Прочее',
};
export function DirectionIcon({ direction }) {
    if (direction === 'inbound')
        return _jsx(PhoneIncoming, { size: 13, style: { color: 'var(--success)', flexShrink: 0 }, "aria-label": "\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0439" });
    if (direction === 'outbound')
        return _jsx(PhoneOutgoing, { size: 13, style: { color: '#6366F1', flexShrink: 0 }, "aria-label": "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0439" });
    return null;
}
export const OBJECTION_TYPE_LABELS = {
    price: 'Цена',
    quality: 'Качество',
    competitors: 'Конкуренты',
    timing: 'Время',
    trust: 'Доверие',
    not_ready: 'Не готов',
    functionality: 'Функциональность',
};
/** Лейблы типов возражений: настраиваемый справочник организации поверх стандартных. */
export function useObjectionTypeLabel() {
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
export function HighlightLegend() {
    return (_jsxs("div", { className: "hl-legend", children: [_jsx("span", { className: "hl-pill hl-pill--script", children: "\u041F\u043E \u0442\u0435\u043A\u0441\u0442\u0443" }), _jsx("span", { className: "hl-pill hl-pill--paraphrased", children: "\u0421\u0432\u043E\u0438\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438" }), _jsx("span", { className: "hl-pill hl-pill--upsell", children: "\u0410\u043F\u0441\u0435\u0439\u043B" }), _jsx("span", { className: "hl-pill hl-pill--crosssell", children: "\u041A\u0440\u043E\u0441\u0441-\u0441\u0435\u0439\u043B" }), _jsx("span", { className: "hl-pill hl-pill--objection", children: "\u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435" })] }));
}
// ─── Fulltext script coverage (блочное покрытие полнотекстового скрипта) ─────
export const BLOCK_STATUS_META = {
    spoken: { icon: '✓', cls: 'done', label: 'произнесён по тексту' },
    paraphrased: { icon: '~', cls: 'partial', label: 'своими словами' },
    missed: { icon: '✕', cls: 'missed', label: 'пропущен' },
    // Ситуация не возникла — блок закономерно не нужен, не штрафуем (нейтрально)
    not_applicable: { icon: '–', cls: 'na', label: 'не требовался' },
};
export function FulltextCoverage({ scriptResult, score, sColor, shortName }) {
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
// ─── Lightweight Markdown renderer for AI summary ────────────────────────────
// Резюме приходит в лёгком Markdown: **жирный** инлайн + маркеры «- ». Без внешних
// зависимостей: разбиваем на строки, поддерживаем **bold** и списки.
function renderInline(text, keyBase) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
        ? _jsx("strong", { style: { color: 'var(--text)' }, children: p.slice(2, -2) }, `${keyBase}-${i}`)
        : _jsx("span", { children: p }, `${keyBase}-${i}`));
}
export function SummaryMarkdown({ text }) {
    const lines = text.split('\n');
    const out = [];
    let bullets = [];
    const flushBullets = () => {
        if (bullets.length) {
            out.push(_jsx("ul", { style: { margin: '4px 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }, children: bullets }, `ul-${out.length}`));
            bullets = [];
        }
    };
    lines.forEach((raw, i) => {
        const line = raw.trim();
        if (!line) {
            flushBullets();
            return;
        }
        const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
            bullets.push(_jsx("li", { style: { lineHeight: 1.5 }, children: renderInline(bulletMatch[1], `li-${i}`) }, `li-${i}`));
        }
        else {
            flushBullets();
            out.push(_jsx("p", { style: { margin: '0 0 8px', lineHeight: 1.55 }, children: renderInline(line, `p-${i}`) }, `p-${i}`));
        }
    });
    flushBullets();
    return _jsx("div", { style: { fontSize: 13.5, color: 'var(--text-secondary)' }, children: out });
}
// ─── История обращений с того же номера клиента ──────────────────────────────
export function ClientHistory({ conversationId, onSelect }) {
    const [open, setOpen] = useState(false);
    const { data } = useQuery({
        queryKey: ['client-history', conversationId],
        queryFn: () => dashboardApi.getClientHistory(conversationId),
        staleTime: 60 * 1000,
        retry: 1,
    });
    const items = data?.items || [];
    // Показываем блок только если у клиента есть ДРУГИЕ обращения помимо текущего
    if (items.length < 2)
        return null;
    return (_jsxs("div", { style: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }, children: [_jsxs("button", { onClick: () => setOpen(o => !o), style: {
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    background: 'var(--bg)', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13,
                }, children: [_jsx(History, { size: 15, style: { color: 'var(--primary)' } }), _jsx("span", { style: { fontWeight: 600 }, children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0439" }), data?.client_phone && _jsxs("span", { style: { color: 'var(--text-muted)' }, children: ["\u00B7 ", data.client_phone] }), _jsx("span", { className: "tag tag-neutral", style: { marginLeft: 'auto' }, children: items.length }), _jsx(ArrowDown, { size: 13, style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--text-muted)' } })] }), open && (_jsx("div", { style: { display: 'flex', flexDirection: 'column' }, children: items.map((it) => {
                    const d = it.session_date ? new Date(it.session_date) : null;
                    const dateStr = d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                    const mins = Math.floor((it.duration_seconds || 0) / 60);
                    const secs = (it.duration_seconds || 0) % 60;
                    return (_jsxs("div", { onClick: () => { if (!it.is_current && onSelect)
                            onSelect(it.id); }, style: {
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                            borderTop: '1px solid var(--border)',
                            cursor: it.is_current ? 'default' : 'pointer',
                            background: it.is_current ? 'var(--bg-active, rgba(99,102,241,0.08))' : 'transparent',
                        }, children: [_jsx(DirectionIcon, { direction: it.call_direction }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }, children: [dateStr, it.is_current && _jsx("span", { style: { fontSize: 11, color: 'var(--primary)', fontWeight: 600 }, children: "\u00B7 \u0442\u0435\u043A\u0443\u0449\u0438\u0439" })] }), _jsxs("div", { style: { fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: [it.topic || '—', it.seller_name ? ` · ${it.seller_name}` : '', it.duration_seconds ? ` · ${mins}:${String(secs).padStart(2, '0')}` : ''] })] }), _jsx(OutcomeTag, { outcome: it.outcome || 'unknown' }), it.overall_score != null && _jsx(ScoreBadge, { score: it.overall_score })] }, it.id));
                }) }))] }));
}
// ─── Вкладка «Резюме диалога» (генерируется LLM по запросу) ───────────────────
export function SummaryTab({ conversationId }) {
    const qc = useQueryClient();
    const [regenerating, setRegenerating] = useState(false);
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['conversation-summary', conversationId],
        queryFn: () => analyticsApi.getConversationSummary(conversationId),
        staleTime: Infinity,
        retry: false,
    });
    const regenerate = async () => {
        setRegenerating(true);
        try {
            const fresh = await analyticsApi.getConversationSummary(conversationId, true);
            qc.setQueryData(['conversation-summary', conversationId], fresh);
        }
        catch { /* ошибка отобразится ниже при повторном рендере, оставляем прошлое резюме */ }
        finally {
            setRegenerating(false);
        }
    };
    if (isLoading)
        return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '32px 20px', color: 'var(--text-muted)', justifyContent: 'center' }, children: [_jsx(Loader, { size: 16, style: { animation: 'viq-spin 1s linear infinite' } }), "\u0418\u0418 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0440\u0435\u0437\u044E\u043C\u0435 \u0434\u0438\u0430\u043B\u043E\u0433\u0430..."] }));
    if (isError && !data) {
        const status = error?.response?.status;
        const msg = status === 422
            ? 'Для этого разговора нет транскрипта — резюме недоступно.'
            : 'Не удалось сгенерировать резюме. Попробуйте ещё раз позже.';
        return (_jsxs("div", { style: { padding: '24px 20px', textAlign: 'center' }, children: [_jsx("div", { style: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 }, children: msg }), status !== 422 && (_jsxs("button", { className: "btn btn-outline btn-sm", onClick: regenerate, disabled: regenerating, children: [_jsx(RefreshCw, { size: 13, style: regenerating ? { animation: 'viq-spin 1s linear infinite' } : undefined }), " \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C"] }))] }));
    }
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Sparkles, { size: 15, style: { color: 'var(--primary)' } }), _jsx("span", { style: { fontWeight: 600, color: 'var(--text)' }, children: "\u0420\u0435\u0437\u044E\u043C\u0435 \u0434\u0438\u0430\u043B\u043E\u0433\u0430" }), _jsxs("button", { className: "btn btn-outline btn-sm", onClick: regenerate, disabled: regenerating, title: "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u044E\u043C\u0435 \u0437\u0430\u043D\u043E\u0432\u043E", style: { marginLeft: 'auto' }, children: [_jsx(RefreshCw, { size: 13, style: regenerating ? { animation: 'viq-spin 1s linear infinite' } : undefined }), regenerating ? 'Обновление...' : 'Обновить'] })] }), data?.summary && (_jsx("div", { style: { padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }, children: _jsx(SummaryMarkdown, { text: data.summary }) })), _jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)' }, children: "\u0420\u0435\u0437\u044E\u043C\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0418\u0418 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442\u0430. \u041C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043D\u0435\u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438." })] }));
}
function sellFromResults(results) {
    let total = 0, matched = 0;
    const missed = [];
    for (const r of results) {
        const required = r.required_offers || [];
        const offered = r.offered_items || [];
        total += required.length;
        matched += offered.length;
        for (const m of (r.missed_items || []))
            missed.push(m);
    }
    let status = 'no-trigger';
    if (results.length > 0) {
        if (total === 0 || matched === total)
            status = 'complete';
        else if (matched === 0)
            status = 'missed';
        else
            status = 'partial';
    }
    return { triggered: true, matched, total, missed, status };
}
/** Допродажа и правила подсветки для детальной карточки. LLM-результаты с бэкенда
 *  в приоритете; для старых разговоров без них — клиентский матч по правилам. */
export function useConversationAnalysis(c, segments) {
    const { data: upsellRules } = useQuery({
        queryKey: ['upsell-rules-all'],
        queryFn: () => scriptsApi.listUpsellRules(),
    });
    const { data: crossSellRules } = useQuery({
        queryKey: ['cross-sell-rules-all'],
        queryFn: () => scriptsApi.listCrossSellRules(),
    });
    const scriptResults = c?.script_results || [];
    const objections = c?.objections || [];
    const storeId = c?.store_id;
    const sellerId = c?.seller_id;
    const upsellResults = Array.isArray(c?.upsell_results) ? c.upsell_results : [];
    const crosssellResults = Array.isArray(c?.crosssell_results) ? c.crosssell_results : [];
    const upsellAnalysis = useMemo(() => {
        if (c?.has_upsell != null && upsellResults.length > 0)
            return sellFromResults(upsellResults);
        return analyzeSell(upsellRules, segments, storeId, sellerId);
    }, [c?.has_upsell, upsellResults, upsellRules, segments, storeId, sellerId]);
    const crossSellAnalysis = useMemo(() => {
        if (c?.has_crosssell != null && crosssellResults.length > 0)
            return sellFromResults(crosssellResults);
        return analyzeSell(crossSellRules, segments, storeId, sellerId);
    }, [c?.has_crosssell, crosssellResults, crossSellRules, segments, storeId, sellerId]);
    const highlightRules = useMemo(() => {
        const rules = [];
        for (const sr of scriptResults) {
            // Полнотекстовый скрипт: цитаты, подтверждающие блоки. spoken — по тексту, paraphrased — своими словами.
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
                // Подсвечиваем только реально выполненные этапы (≥70%) — частичные вводят в заблуждение
                if (!isDetected || rawScore < 70)
                    continue;
                rules.push({ text: evidence, kind: 'script-done', tooltip: `Этап «${step.step_name || step.name}» — выполнен (${Math.round(rawScore)}%)` });
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
        // Цитаты LLM по апсейлу/кросс-сейлу — дословные, устойчивые к опечаткам транскрибации
        const pushSellQuotes = (results, kind) => {
            const label = kind === 'upsell' ? 'Апсейл' : 'Кросс-сейл';
            for (const r of results) {
                const product = r.trigger_product || '';
                for (const q of (r.trigger_quotes || [])) {
                    if (typeof q === 'string' && q.trim().length >= 3)
                        rules.push({ text: q, kind: `${kind}-trigger`, tooltip: `${label}: триггер «${product}»` });
                }
                const offerQuotes = r.offer_quotes || {};
                for (const offer in offerQuotes) {
                    for (const q of (offerQuotes[offer] || [])) {
                        if (typeof q === 'string' && q.trim().length >= 3)
                            rules.push({ text: q, kind: `${kind}-offer`, tooltip: `${label}: предложение «${offer}»` });
                    }
                }
            }
        };
        if (upsellResults.length > 0)
            pushSellQuotes(upsellResults, 'upsell');
        else
            rules.push(...highlightRulesForSell(upsellRules, storeId, 'upsell', sellerId));
        if (crosssellResults.length > 0)
            pushSellQuotes(crosssellResults, 'crosssell');
        else
            rules.push(...highlightRulesForSell(crossSellRules, storeId, 'crosssell', sellerId));
        return rules;
    }, [scriptResults, objections, upsellResults, crosssellResults, upsellRules, crossSellRules, storeId, sellerId]);
    return { highlightRules, upsellAnalysis, crossSellAnalysis, upsellResults, crosssellResults };
}
// ─── Где в разговоре прозвучала цитата ───────────────────────────────────────
// Возражения, нарушения и доказательства этапов хранятся цитатами без таймкода —
// ищем реплику с наибольшим совпадением слов (как dashboard-service/app/fingerprint.py).
const WORD = /[0-9a-zа-яё]+/gi;
function tokens(text) {
    return new Set(((text || '').toLowerCase().replace(/ё/g, 'е').match(WORD) || []).filter((w) => w.length > 2));
}
/** Индекс реплики, где прозвучала цитата, или -1. */
export function locateQuote(quote, segments) {
    const q = tokens(quote);
    if (!q.size)
        return -1;
    let best = -1;
    let bestScore = 0;
    segments.forEach((seg, i) => {
        const st = tokens(seg.text);
        if (!st.size)
            return;
        let matched = 0;
        q.forEach((w) => { if (st.has(w))
            matched++; });
        if (!matched)
            return;
        const score = matched >= 3 || matched === q.size ? matched / Math.min(q.size, st.size) : matched / q.size;
        if (score > bestScore) {
            best = i;
            bestScore = score;
        }
    });
    return bestScore >= 0.6 ? best : -1;
}
export function useStableCallback(fn) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useCallback(fn, []);
}
