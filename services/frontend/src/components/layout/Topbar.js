import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, ChevronRight } from 'lucide-react';
import { notificationsApi } from '@/api/notifications';
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
            const t = e.target;
            if (popRef.current?.contains(t))
                return;
            if (btnRef.current?.contains(t))
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
    return (_jsxs("div", { className: "topbar", children: [_jsxs("div", { className: "topbar-left", children: [_jsx("h1", { className: "page-title", children: title }), subtitle && _jsx("p", { className: "page-subtitle", children: subtitle })] }), _jsxs("div", { className: "topbar-right", children: [showPeriod && onPeriodChange && (_jsxs("div", { className: "period-pill", children: [_jsx("span", { className: "period-pill-value", children: period === 7 ? '7 дней' : period === 90 ? '90 дней' : '30 дней' }), _jsx(ChevronDown, { size: 14, className: "period-pill-chevron" }), _jsxs("select", { value: period, onChange: (e) => onPeriodChange(parseInt(e.target.value)), "aria-label": "\u041F\u0435\u0440\u0438\u043E\u0434", children: [_jsx("option", { value: 7, children: "7 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 30, children: "30 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 90, children: "90 \u0434\u043D\u0435\u0439" })] })] })), _jsxs("div", { style: { position: 'relative' }, children: [_jsxs("button", { ref: btnRef, className: "icon-btn", onClick: () => setOpen((v) => !v), "aria-label": "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F", children: [_jsx(Bell, { size: 20 }), unreadCount > 0 && _jsx("span", { className: "notif-badge", children: unreadCount > 9 ? '9+' : unreadCount })] }), open && (_jsxs("div", { ref: popRef, style: {
                                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                    width: 360, maxHeight: 480, overflow: 'auto',
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
                                    zIndex: 1200, display: 'flex', flexDirection: 'column',
                                }, children: [_jsx("div", { style: { padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }, children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F" }), notifications.length === 0 ? (_jsx("div", { style: { padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }, children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439" })) : (notifications.map((n) => (_jsxs("button", { onClick: () => {
                                            setOpen(false);
                                            navigate(`/conversations?conv=${n.conversation_id}`);
                                        }, style: {
                                            background: 'transparent', border: 'none', textAlign: 'left',
                                            padding: '12px 14px', cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-light)',
                                            display: 'flex', alignItems: 'flex-start', gap: 10,
                                        }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--bg)'), onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'), children: [_jsx("div", { style: {
                                                    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                                                    background: n.severity === 'high' ? 'var(--danger)' : n.severity === 'medium' ? 'var(--warning)' : 'var(--text-muted)',
                                                } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 500, marginBottom: 2 }, children: [n.seller_name || '—', n.store_name && _jsxs("span", { style: { color: 'var(--text-muted)', fontWeight: 400 }, children: [" \u00B7 ", n.store_name] })] }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }, children: n.reasons.join(' · ') }), _jsxs("div", { style: { fontSize: 11, color: 'var(--text-muted)' }, children: [new Date(n.session_date).toLocaleDateString('ru-RU'), typeof n.overall_score === 'number' && (_jsxs("span", { children: [" \u00B7 \u0441\u043A\u043E\u0440 ", Math.round(n.overall_score), "%"] }))] })] }), _jsx(ChevronRight, { size: 14, style: { color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 } })] }, n.conversation_id))))] }))] })] })] }));
}
