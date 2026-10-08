import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTerms } from '@/lib/terms';
import { outcomeColor, outcomeLabel } from '@/lib/outcomes';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { notificationsApi } from '@/api/notifications';
import { LineChartWidget } from '@/components/charts/LineChartWidget';
import { BarChartWidget } from '@/components/charts/BarChartWidget';
import { DonutChartWidget } from '@/components/charts/DonutChartWidget';
import { ScoreBadge } from '@/components/ScoreBadge';
import { OutcomeTag } from '@/components/OutcomeTag';
import { AlertCircle, ChevronRight, ShieldAlert } from 'lucide-react';
const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1'];
export function DashboardPage() {
    const { period } = useOutletContext();
    const terms = useTerms();
    const navigate = useNavigate();
    const { data: overview, isLoading } = useQuery({
        queryKey: ['dashboard-overview', period],
        queryFn: () => dashboardApi.getOverview({ period }),
    });
    const { data: conversations } = useQuery({
        queryKey: ['conversations-recent', period],
        queryFn: () => dashboardApi.getConversations({ page: 1, limit: 8 }),
    });
    const { data: sellers } = useQuery({
        queryKey: ['sellers-for-dashboard', period],
        queryFn: () => dashboardApi.getSellers({ period }),
    });
    const { data: notifications } = useQuery({
        queryKey: ['dashboard-notifications', period],
        queryFn: () => notificationsApi.listFull({ limit: 5, days: period }),
        staleTime: 30000,
    });
    if (isLoading) {
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    }
    // Compute store scores from sellers data
    const storeMap = new Map();
    sellers?.forEach((s) => {
        const key = s.store_name || s.store_id || 'unknown';
        const existing = storeMap.get(key) || { total: 0, count: 0, name: s.store_name || s.store_id || key };
        existing.total += s.avg_score || 0;
        existing.count++;
        storeMap.set(key, existing);
    });
    const storesChartData = Array.from(storeMap.values()).map((data) => ({
        label: data.name,
        value: Math.round(data.total / data.count),
    }));
    // Conversations by day
    const conversationsByDayData = (overview?.conversations_by_day || overview?.daily_stats || []).map((d) => ({
        label: new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        value: d.count ?? d.total ?? 0,
    }));
    // Outcomes donut
    const outcomesDonutData = (overview?.outcomes || []).map((o) => ({
        name: outcomeLabel(o.outcome),
        value: o.count,
        color: outcomeColor(o.outcome),
    }));
    // Сводка по уведомлениям (нарушения комплаенса + низкий скор)
    const notificationsTotal = notifications?.total ?? 0;
    const notificationsItems = notifications?.items ?? [];
    const scoreThreshold = notifications?.score_threshold ?? 40;
    return (_jsxs("div", { children: [_jsxs("div", { className: "metrics-grid fade-in", children: [_jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsx("div", { className: "metric-value", children: (overview?.total_conversations || 0).toLocaleString('ru-RU') })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433 \u0441\u043A\u0440\u0438\u043F\u0442\u0430" }), _jsxs("div", { className: "metric-value", children: [Math.round(overview?.avg_score || 0), "%"] })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u0432 \u043F\u043E\u043A\u0443\u043F\u043A\u0443" }), _jsxs("div", { className: "metric-value", children: [Math.round((overview?.conversion_rate || 0) * 100), "%"] })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F" }), _jsx("div", { className: "metric-value", style: { color: notificationsTotal > 0 ? 'var(--danger)' : 'var(--success)' }, children: notificationsTotal }), _jsxs("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }, children: ["\u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441\u0430 \u0438\u043B\u0438 \u0441\u043A\u043E\u0440 < ", Math.round(scoreThreshold), "%"] })] })] }), _jsxs("div", { className: "grid-2 fade-in", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B \u043F\u043E \u0434\u043D\u044F\u043C" }), _jsx("div", { className: "card-subtitle", children: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0445 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" })] }) }), _jsx(LineChartWidget, { data: conversationsByDayData })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0421\u043A\u043E\u0440\u0438\u043D\u0433 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }), _jsxs("div", { className: "card-subtitle", children: ["\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0431\u0430\u043B\u043B ", terms.isTelephony ? 'по отделам' : 'по магазинам'] })] }) }), _jsx(BarChartWidget, { data: storesChartData })] })] }), _jsxs("div", { className: "grid-2 fade-in", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0418\u0441\u0445\u043E\u0434\u044B \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("div", { className: "card-subtitle", children: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" })] }) }), outcomesDonutData.length > 0 ? (_jsx(DonutChartWidget, { data: outcomesDonutData })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }) }))] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F" }), _jsxs("div", { className: "card-subtitle", children: ["\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441\u0430 \u0438\u043B\u0438 \u0441\u043A\u043E\u0440 < ", Math.round(scoreThreshold), "%"] })] }), notificationsTotal > notificationsItems.length && (_jsx("button", { className: "btn btn-outline btn-sm", onClick: () => navigate('/compliance'), children: "\u0412\u0441\u0435 \u2192" }))] }), _jsx("div", { style: { display: 'flex', flexDirection: 'column' }, children: notificationsItems.length === 0 ? (_jsx("div", { style: { padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }, children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u0439 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" })) : (notificationsItems.map((n) => {
                                    const sevColor = n.severity === 'high' ? 'var(--danger)' :
                                        n.severity === 'medium' ? 'var(--warning)' : 'var(--text-muted)';
                                    const Icon = n.compliance_violations_count > 0 ? ShieldAlert : AlertCircle;
                                    return (_jsxs("button", { onClick: () => navigate(`/conversations?conv=${n.conversation_id}`), style: {
                                            background: 'transparent', border: 'none', textAlign: 'left',
                                            padding: '10px 4px', cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-light)',
                                            display: 'flex', alignItems: 'flex-start', gap: 10,
                                        }, onMouseEnter: (e) => (e.currentTarget.style.background = 'var(--bg)'), onMouseLeave: (e) => (e.currentTarget.style.background = 'transparent'), children: [_jsx(Icon, { size: 16, style: { color: sevColor, marginTop: 2, flexShrink: 0 } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 500, marginBottom: 2 }, children: [n.seller_name || '—', n.store_name && (_jsxs("span", { style: { color: 'var(--text-muted)', fontWeight: 400 }, children: [" \u00B7 ", n.store_name] }))] }), _jsx("div", { style: { fontSize: 11.5, color: 'var(--text-muted)' }, children: n.reasons.join(' · ') })] }), _jsx(ChevronRight, { size: 14, style: { color: 'var(--text-muted)', marginTop: 4, flexShrink: 0 } })] }, n.conversation_id));
                                })) })] })] }), _jsxs("div", { className: "card fade-in", children: [_jsxs("div", { className: "card-header", children: [_jsx("div", { className: "card-title", children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B" }), _jsx("button", { className: "btn btn-outline btn-sm", onClick: () => navigate('/conversations'), children: "\u0412\u0441\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B \u2192" })] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0414\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043C\u044F" }), _jsx("th", { children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("th", { children: terms.store }), _jsx("th", { children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C" }), _jsx("th", { children: "\u0422\u0435\u043C\u0430" }), _jsx("th", { style: { textAlign: 'center' }, children: "\u0421\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("th", { style: { textAlign: 'center' }, children: "\u0418\u0441\u0445\u043E\u0434" })] }) }), _jsx("tbody", { children: (conversations?.items || []).map((c, idx) => {
                                        const mins = Math.floor((c.duration_seconds || 0) / 60);
                                        const secs = (c.duration_seconds || 0) % 60;
                                        const dateSource = c.analyzed_at || c.recorded_at || c.session_date || '';
                                        const dateObj = dateSource ? new Date(dateSource) : null;
                                        const dateStr = dateObj
                                            ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                                            : '—';
                                        const timeStr = dateObj
                                            ? dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                                            : '';
                                        const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                                        return (_jsxs("tr", { onClick: () => navigate('/conversations'), style: { cursor: 'pointer' }, children: [_jsxs("td", { children: [dateStr, ' ', _jsx("span", { style: { color: 'var(--text-muted)' }, children: timeStr })] }), _jsx("td", { children: _jsxs("div", { className: "seller-cell", children: [_jsx("div", { className: "avatar", style: { background: color }, children: (c.seller_name || '?')[0].toUpperCase() }), _jsx("div", { children: _jsx("div", { className: "name", children: c.seller_name || c.seller_id }) })] }) }), _jsx("td", { style: { color: 'var(--text-muted)' }, children: c.store_name || c.store_id }), _jsxs("td", { children: [mins, ":", String(secs).padStart(2, '0')] }), _jsx("td", { style: { color: 'var(--text-secondary)' }, children: c.topic || '—' }), _jsx("td", { style: { textAlign: 'center' }, children: c.is_scorable === false
                                                        ? _jsx("span", { className: "tag tag-neutral", title: "\u041D\u0435\u0446\u0435\u043B\u0435\u0432\u043E\u0439/\u0441\u0435\u0440\u0432\u0438\u0441\u043D\u044B\u0439 \u0437\u0432\u043E\u043D\u043E\u043A \u2014 \u043D\u0435 \u0432\u043B\u0438\u044F\u0435\u0442 \u043D\u0430 \u0440\u0435\u0439\u0442\u0438\u043D\u0433", children: "\u041D\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u0435\u0442\u0441\u044F" })
                                                        : _jsx(ScoreBadge, { score: c.overall_score }) }), _jsx("td", { style: { textAlign: 'center' }, children: _jsx(OutcomeTag, { outcome: c.outcome }) })] }, c.id));
                                    }) })] }) })] })] }));
}
