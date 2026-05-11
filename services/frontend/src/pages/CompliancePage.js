import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { BarChartWidget } from '@/components/charts/BarChartWidget';
export function CompliancePage() {
    const { period } = useOutletContext();
    const { data: conversations, isLoading } = useQuery({
        queryKey: ['conversations-compliance', period],
        queryFn: () => dashboardApi.getConversations({ limit: 200 }),
    });
    const items = conversations?.items ?? [];
    const total = items.length;
    const withViolations = items.filter((c) => c.has_violations);
    const compliant = items.filter((c) => c.compliance_ok !== false && !c.has_violations);
    const complianceRate = total > 0 ? (compliant.length / total) * 100 : 0;
    // Group violations by outcome to show patterns
    const violationsByOutcome = {};
    withViolations.forEach((c) => {
        const key = c.outcome || 'unknown';
        violationsByOutcome[key] = (violationsByOutcome[key] || 0) + 1;
    });
    const outcomeLabels = {
        purchase: 'Покупка', deferred: 'Отложено', price_objection: 'Цена',
        competitor: 'Конкурент', unknown: 'Неизвестно',
    };
    const violationChartData = Object.entries(violationsByOutcome)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({
        label: outcomeLabels[key] || key,
        value: count,
    }));
    // Recent violations list
    const recentViolations = withViolations
        .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
        .slice(0, 20);
    if (isLoading) {
        return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '60px 0' }, children: _jsx("div", { className: "spinner" }) }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "metrics-grid fade-in", children: [_jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0423\u0440\u043E\u0432\u0435\u043D\u044C \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F" }), _jsxs("div", { className: "metric-value", children: [complianceRate.toFixed(0), "%"] }), _jsx("div", { className: "metric-change up", style: {
                                    background: complianceRate >= 90 ? 'var(--success-light)' : 'var(--warning-light)',
                                    color: complianceRate >= 90 ? 'var(--success)' : 'var(--warning)',
                                }, children: complianceRate >= 90 ? 'Хорошо' : 'Требует внимания' })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("div", { className: "metric-value", children: total })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }), _jsx("div", { className: "metric-value", style: { color: withViolations.length > 0 ? 'var(--danger)' : 'var(--success)' }, children: withViolations.length })] })] }), _jsxs("div", { className: "grid-2 fade-in", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043F\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443" }), _jsx("div", { className: "card-subtitle", children: "\u041A\u0430\u043A \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u0441\u0432\u044F\u0437\u0430\u043D\u044B \u0441 \u0438\u0441\u0445\u043E\u0434\u043E\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430" })] }) }), violationChartData.length > 0 ? (_jsx(BarChartWidget, { data: violationChartData, color: "#EF4444", height: 220 })) : (_jsx("div", { style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }, children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0421\u0432\u043E\u0434\u043A\u0430" }), _jsx("div", { className: "card-subtitle", children: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441\u0430" })] }) }), _jsxs("div", { style: { padding: '20px' }, children: [_jsxs("div", { style: { marginBottom: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 13 }, children: "\u0411\u0435\u0437 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439" }), _jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: compliant.length })] }), _jsx("div", { style: {
                                                    height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden',
                                                }, children: _jsx("div", { style: {
                                                        width: total > 0 ? `${(compliant.length / total) * 100}%` : '0%',
                                                        height: '100%', background: 'var(--success)', borderRadius: 4,
                                                    } }) })] }), _jsxs("div", { style: { marginBottom: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 13 }, children: "\u0421 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F\u043C\u0438" }), _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: 'var(--danger)' }, children: withViolations.length })] }), _jsx("div", { style: {
                                                    height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden',
                                                }, children: _jsx("div", { style: {
                                                        width: total > 0 ? `${(withViolations.length / total) * 100}%` : '0%',
                                                        height: '100%', background: 'var(--danger)', borderRadius: 4,
                                                    } }) })] }), _jsxs("div", { style: {
                                            padding: '12px', background: 'var(--bg)', borderRadius: 8, marginTop: 16,
                                        }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }, children: "\u041E\u0431\u0449\u0438\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u043A\u043E\u043C\u043F\u043B\u0430\u0435\u043D\u0441\u0430" }), _jsxs("div", { style: {
                                                    fontSize: 28, fontWeight: 700,
                                                    color: complianceRate >= 90 ? 'var(--success)' : complianceRate >= 70 ? 'var(--warning)' : 'var(--danger)',
                                                }, children: [complianceRate.toFixed(1), "%"] })] })] })] })] }), _jsxs("div", { className: "card fade-in", style: { marginTop: 20 }, children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F" }), _jsx("div", { className: "card-subtitle", children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B \u0441 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u043C\u0438 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F\u043C\u0438" })] }) }), recentViolations.length === 0 ? (_jsx("div", { style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }, children: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u2014 \u043E\u0442\u043B\u0438\u0447\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430!" })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { children: "\u0422\u0435\u043C\u0430" }), _jsx("th", { children: "\u041E\u0446\u0435\u043D\u043A\u0430" }), _jsx("th", { children: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442" })] }) }), _jsx("tbody", { children: recentViolations.map((c) => (_jsxs("tr", { children: [_jsx("td", { children: new Date(c.session_date).toLocaleDateString('ru-RU') }), _jsx("td", { children: c.topic || '—' }), _jsx("td", { children: _jsx("span", { style: {
                                                    color: c.overall_score >= 70 ? 'var(--success)' : c.overall_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                                                    fontWeight: 600,
                                                }, children: c.overall_score.toFixed(0) }) }), _jsx("td", { children: _jsx("span", { className: "badge", style: {
                                                    background: 'var(--danger-light)', color: 'var(--danger)',
                                                }, children: outcomeLabels[c.outcome] || c.outcome }) })] }, c.id))) })] }))] })] }));
}
