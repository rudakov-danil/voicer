import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, AudioLines } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { OutcomeTag } from '@/components/OutcomeTag';
import { Meter } from '@/components/ui/Meter';
import { Fingerprint, clock } from '@/components/ui/Fingerprint';
import { ReviewButton } from '@/components/conversation/Coaching';
import { parseSummary, isNoneSection } from '@/components/conversation/shared';
import { t, L, locale } from '@/i18n';
/* Быстрый просмотр разговора из списка (ui-concept/conversations.html → .drawer):
   «отпечаток», итог ИИ, моменты, этапы скрипта и действия. Полная карточка — по кнопке. */
const MOMENT = {
    crit: 'Нарушение',
    'crit-mid': 'Нарушение',
    warn: 'Возражение без ответа',
    'warn-ok': 'Возражение отработано',
    ok: 'Предложение допродажи',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function initialsOf(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
export function QuickView({ id, row, fingerprint: fpFromList, markTitle, onClose }) {
    const open = !!id;
    const closeRef = useRef(null);
    const lastFocus = useRef(null);
    const { data } = useQuery({
        queryKey: ['conversation-detail', id],
        queryFn: () => dashboardApi.getConversationDetail(id),
        enabled: open,
    });
    // Разговор открыт по ссылке и не на текущей странице списка — «отпечаток» берём отдельно
    const { data: fpOwn } = useQuery({
        queryKey: ['fingerprints', id],
        queryFn: () => dashboardApi.getFingerprints([id]),
        enabled: open && !fpFromList,
        staleTime: 5 * 60 * 1000,
    });
    const fingerprint = fpFromList || (id ? fpOwn?.[id] : null);
    useEffect(() => {
        if (!open)
            return;
        lastFocus.current = document.activeElement;
        closeRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            if (lastFocus.current instanceof HTMLElement)
                lastFocus.current.focus();
        };
    }, [open, onClose]);
    const c = data?.conversation || row || {};
    const when = c.recorded_at || c.analyzed_at || c.session_date;
    const whenDate = when ? new Date(when) : null;
    const scriptResult = (c.script_results || []).find((sr) => sr.was_applied !== false) || (c.script_results || [])[0];
    const steps = scriptResult?.step_scores || [];
    const parts = c.summary ? parseSummary(c.summary) : null;
    const brief = parts?.['Итог'] || (c.summary ? String(c.summary).split('\n').find((l) => l.trim())?.replace(/\*\*/g, '') : null);
    const marks = fingerprint ? [...fingerprint.marks].sort((a, b) => a.t - b.t) : [];
    const notScored = c.is_scorable === false;
    const sourceLabel = c.source === 'badge' ? t('Вырезан ИИ из записи смены с бейджа')
        : c.source === 'transcript' ? t('Загружен текстом — без аудио')
            : t('Загруженное аудио');
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `drawer-overlay ${open ? 'open' : ''}`, onClick: onClose }), _jsx("aside", { className: `drawer qv ${open ? 'open' : ''}`, "aria-label": t('Быстрый просмотр разговора'), "aria-hidden": !open, children: open && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "drawer-header", children: [_jsxs("div", { className: "qv-head-meta", children: [_jsx(OutcomeTag, { outcome: c.outcome || 'unknown' }), _jsx("span", { className: "muted", "aria-hidden": "true", children: "\u00B7" }), notScored ? _jsx("span", { className: "muted", children: t('Не оценивается') }) : _jsx(Meter, { score: c.overall_score })] }), _jsx("button", { ref: closeRef, type: "button", className: "btn-icon", onClick: onClose, "aria-label": t('Закрыть'), children: _jsx(X, { size: 18, "aria-hidden": "true" }) })] }), _jsxs("div", { className: "drawer-body", children: [_jsx("div", { className: "qv-title", translate: c.topic ? 'no' : undefined, children: c.topic || t('Разговор без темы') }), _jsx("div", { className: "qv-meta", children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initialsOf(c.seller_name) }), _jsxs("span", { children: [_jsx("span", { className: "person-name", translate: "no", children: c.seller_name || '—' }), _jsx("span", { className: "person-sub", translate: "no", children: c.store_name })] })] }) }), _jsxs("div", { className: "qv-meta", style: { marginTop: 8 }, children: [whenDate && _jsxs("span", { children: [whenDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' }), ", ", whenDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })] }), c.duration_seconds ? _jsxs(_Fragment, { children: [_jsx("span", { className: "muted", children: "\u00B7" }), _jsx("span", { className: "mono", children: clock(c.duration_seconds) })] }) : null] }), fingerprint && (_jsxs("div", { className: "qv-fp", children: [_jsx(Fingerprint, { data: fingerprint, height: 56, markTitle: markTitle }), _jsxs("div", { className: "qv-ruler", "aria-hidden": "true", children: [_jsx("span", { children: "00:00" }), _jsx("span", { children: clock(fingerprint.dur / 2) }), _jsx("span", { children: clock(fingerprint.dur) })] }), _jsxs("div", { className: "qv-legend", children: [_jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: 'var(--seller)' } }), t('Продавец')] }), _jsxs("span", { className: "legend-item", children: [_jsx("span", { className: "key-bar", style: { background: 'var(--client)' } }), t('Покупатель')] }), fingerprint.talk != null && _jsx("span", { className: "qv-talk", children: L(`продавец говорит ${fingerprint.talk} %`, `seller talks ${fingerprint.talk}%`) })] })] })), brief && (_jsxs("section", { className: "qv-sec", children: [_jsxs("h3", { children: [t('Коротко'), " ", _jsx("span", { className: "tag tag-primary", children: t('ИИ') })] }), _jsx("p", { className: "qv-sum", translate: "no", children: brief }), parts && !isNoneSection(parts['Риск претензии']) && (_jsxs("p", { className: "qv-sum qv-risk", translate: "no", children: [_jsxs("b", { children: [t('Риск претензии'), ":"] }), " ", parts['Риск претензии']] }))] })), marks.length > 0 && (_jsxs("section", { className: "qv-sec", children: [_jsx("h3", { children: t('Моменты') }), marks.map((m, i) => (_jsxs(Link, { className: "qv-moment", to: `/conversations/${id}?t=${Math.max(0, Math.round(m.t * fingerprint.dur) - 1)}`, children: [_jsx("span", { className: "mono", children: clock(m.t * fingerprint.dur) }), _jsx("span", { className: `mk is-${m.k}`, "aria-hidden": "true" }), _jsx("span", { children: cap(markTitle ? markTitle(m) : t(MOMENT[m.k])) })] }, i)))] })), steps.length > 0 && !notScored && (_jsxs("section", { className: "qv-sec", children: [_jsx("h3", { children: t('Этапы скрипта') }), steps.map((s, i) => (_jsxs("div", { className: "qv-step", children: [_jsx("span", { className: "ellipsis", translate: "no", children: s.step_name }), _jsx(Meter, { score: s.score })] }, i)))] })), _jsxs("section", { className: "qv-sec", children: [_jsx("h3", { children: t('Запись') }), _jsxs("dl", { className: "cv-rec-list", style: { marginTop: 0, paddingTop: 0, borderTop: 0 }, children: [_jsx("dt", { children: t('Источник') }), _jsx("dd", { children: sourceLabel }), _jsx("dt", { children: t('Роли') }), _jsx("dd", { children: t('размечены автоматически') })] })] })] }), _jsxs("div", { className: "qv-foot", children: [_jsxs(Link, { className: "btn btn-primary", to: `/conversations/${id}`, children: [_jsx(AudioLines, { size: 15, "aria-hidden": "true" }), t('Открыть разговор')] }), _jsx(ReviewButton, { conversationId: id, sellerName: c.seller_name })] })] })) })] }));
}
