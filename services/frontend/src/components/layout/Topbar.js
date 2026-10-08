import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight } from 'lucide-react';
import { notificationsApi } from '@/api/notifications';
import { t, L, locale } from '@/i18n';
const PERIOD_OPTIONS = [
    { value: 7, label: '7 дней' },
    { value: 30, label: '30 дней' },
    { value: 90, label: '90 дней' },
    { value: 180, label: '6 мес' },
    { value: 365, label: 'Год' },
];
export function Topbar({ title, subtitle, onPeriodChange, period = 30, showPeriod = true }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const popRef = useRef(null);
    const btnRef = useRef(null);
    const { data: notifications = [] } = useQuery({
        queryKey: ['dashboard-notifications'],
        queryFn: () => notificationsApi.list({ limit: 20 }),
        staleTime: 30000,
        refetchInterval: 60000,
    });
    useEffect(() => {
        if (!open)
            return;
        const onDoc = (e) => {
            const target = e.target;
            if (popRef.current?.contains(target))
                return;
            if (btnRef.current?.contains(target))
                return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const unreadCount = notifications.length;
    return (_jsx("header", { className: "topbar", children: _jsxs("div", { className: "topbar-inner", children: [_jsxs("div", { className: "topbar-left", children: [_jsx("h1", { className: "page-title", children: t(title) }), subtitle && _jsx("p", { className: "page-subtitle", children: subtitle })] }), _jsxs("div", { className: "topbar-right", children: [showPeriod && onPeriodChange && (_jsx("div", { className: "seg", role: "group", "aria-label": t('Период'), children: PERIOD_OPTIONS.map((o) => (_jsx("button", { type: "button", "aria-pressed": o.value === period, onClick: () => onPeriodChange(o.value), children: t(o.label) }, o.value))) })), _jsxs("div", { style: { position: 'relative' }, children: [_jsxs("button", { ref: btnRef, type: "button", className: "icon-btn", onClick: () => setOpen((v) => !v), "aria-label": t('Уведомления'), "aria-expanded": open, children: [_jsx(Bell, { size: 16, "aria-hidden": "true" }), unreadCount > 0 && _jsx("span", { className: "notif-badge", children: unreadCount > 9 ? '9+' : unreadCount })] }), open && (_jsxs("div", { ref: popRef, className: "popover", style: { top: 'calc(100% + 6px)', right: 0, width: 360, maxHeight: 480, overflowY: 'auto' }, children: [_jsx("div", { className: "popover-head", children: t('Уведомления') }), notifications.length === 0 ? (_jsx("div", { className: "popover-empty", children: t('Нет активных уведомлений') })) : (notifications.map((n) => (_jsxs("button", { type: "button", className: "popover-item", onClick: () => {
                                                setOpen(false);
                                                navigate(`/conversations?conv=${n.conversation_id}`);
                                            }, children: [_jsx("span", { "aria-hidden": "true", style: {
                                                        width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                                                        background: n.severity === 'high' ? 'var(--crit)' : n.severity === 'medium' ? 'var(--warn)' : 'var(--ink-4)',
                                                    } }), _jsxs("span", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("span", { style: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 2 }, translate: "no", children: [n.seller_name || '—', n.store_name && _jsxs("span", { style: { color: 'var(--ink-3)', fontWeight: 400 }, children: [" \u00B7 ", n.store_name] })] }), _jsx("span", { style: { display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }, children: n.reasons.map(t).join(' · ') }), _jsxs("span", { style: { display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }, children: [new Date(n.session_date).toLocaleDateString(locale), typeof n.overall_score === 'number' && (_jsxs("span", { children: [" \u00B7 ", L('скор', 'score'), " ", Math.round(n.overall_score), "%"] }))] })] }), _jsx(ChevronRight, { size: 14, "aria-hidden": "true", style: { color: 'var(--ink-3)', flexShrink: 0, marginTop: 4 } })] }, n.conversation_id))))] }))] })] })] }) }));
}
