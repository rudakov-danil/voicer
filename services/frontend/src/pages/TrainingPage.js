import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
export function TrainingPage() {
    const { period } = useOutletContext();
    const { data: sellers = [], isLoading } = useQuery({
        queryKey: ['sellers'],
        queryFn: () => dashboardApi.getSellers(),
    });
    const { data: conversations } = useQuery({
        queryKey: ['conversations-training', period],
        queryFn: () => dashboardApi.getConversations({ limit: 100, score_min: 85 }),
    });
    // Newcomers: sellers with few conversations (< 20) — proxy for new hires
    const newcomers = sellers
        .filter((s) => (s.conversations_count ?? 0) < 20 && (s.conversations_count ?? 0) > 0)
        .sort((a, b) => (a.conversations_count ?? 0) - (b.conversations_count ?? 0));
    // Best conversations for learning
    const bestConversations = (conversations?.items ?? [])
        .sort((a, b) => b.overall_score - a.overall_score)
        .slice(0, 10);
    if (isLoading) {
        return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '60px 0' }, children: _jsx("div", { className: "spinner" }) }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "card fade-in", style: { marginBottom: 20 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041D\u043E\u0432\u0438\u0447\u043A\u0438" }), _jsx("div", { className: "card-subtitle", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0446\u044B \u0441 \u043C\u0435\u043D\u0435\u0435 \u0447\u0435\u043C 20 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C\u0438" })] }), _jsx("div", { className: "badge", children: newcomers.length })] }), newcomers.length === 0 ? (_jsx("div", { style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }, children: "\u041D\u0435\u0442 \u043D\u043E\u0432\u0438\u0447\u043A\u043E\u0432 \u0432 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0438" })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("th", { children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("th", { children: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0431\u0430\u043B\u043B" }), _jsx("th", { children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F" }), _jsx("th", { children: "\u0421\u043B\u0430\u0431\u043E\u0435 \u043C\u0435\u0441\u0442\u043E" }), _jsx("th", { children: "\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441" })] }) }), _jsx("tbody", { children: newcomers.map((s) => {
                                    const score = s.avg_score ?? 0;
                                    const progress = Math.min(100, ((s.conversations_count ?? 0) / 20) * 100);
                                    return (_jsxs("tr", { children: [_jsxs("td", { style: { fontWeight: 500 }, children: [s.first_name, " ", s.last_name] }), _jsx("td", { children: s.conversations_count ?? 0 }), _jsx("td", { children: _jsx("span", { style: {
                                                        color: score >= 70 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)',
                                                        fontWeight: 600,
                                                    }, children: score.toFixed(0) }) }), _jsxs("td", { children: [((s.conversion_rate ?? 0) * 100).toFixed(0), "%"] }), _jsx("td", { style: { color: 'var(--text-muted)', fontSize: 13 }, children: s.weakest_step || '—' }), _jsx("td", { style: { width: 140 }, children: _jsxs("div", { style: {
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                    }, children: [_jsx("div", { style: {
                                                                flex: 1, height: 6, background: 'var(--bg)',
                                                                borderRadius: 3, overflow: 'hidden',
                                                            }, children: _jsx("div", { style: {
                                                                    width: `${progress}%`, height: '100%',
                                                                    background: progress >= 80 ? 'var(--success)' : 'var(--primary)',
                                                                    borderRadius: 3, transition: 'width 0.3s',
                                                                } }) }), _jsxs("span", { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 32 }, children: [progress.toFixed(0), "%"] })] }) })] }, s.id));
                                }) })] }))] }), _jsxs("div", { className: "card fade-in", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041B\u0443\u0447\u0448\u0438\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B \u0434\u043B\u044F \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u044F" }), _jsx("div", { className: "card-subtitle", children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B \u0441 \u043E\u0446\u0435\u043D\u043A\u043E\u0439 85+ \u2014 \u043E\u0442\u043B\u0438\u0447\u043D\u044B\u0435 \u043F\u0440\u0438\u043C\u0435\u0440\u044B" })] }) }), bestConversations.length === 0 ? (_jsx("div", { style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }, children: "\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0441 \u0432\u044B\u0441\u043E\u043A\u0438\u043C \u0431\u0430\u043B\u043B\u043E\u043C" })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { children: "\u0422\u0435\u043C\u0430" }), _jsx("th", { children: "\u041E\u0446\u0435\u043D\u043A\u0430" }), _jsx("th", { children: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442" }), _jsx("th", { children: "\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C" })] }) }), _jsx("tbody", { children: bestConversations.map((c) => {
                                    const outcomeLabels = {
                                        purchase: 'Покупка', deferred: 'Отложено', price_refusal: 'Возражение по цене',
                                        competitor: 'Конкурент', unknown: 'Неизвестно',
                                    };
                                    const outcomeColors = {
                                        purchase: 'var(--success)', deferred: 'var(--warning)',
                                        price_refusal: 'var(--danger)', competitor: 'var(--primary)',
                                    };
                                    return (_jsxs("tr", { children: [_jsx("td", { children: new Date(c.session_date).toLocaleDateString('ru-RU') }), _jsx("td", { children: c.topic || '—' }), _jsx("td", { children: _jsx("span", { style: { color: 'var(--success)', fontWeight: 600 }, children: c.overall_score.toFixed(0) }) }), _jsx("td", { children: _jsx("span", { className: "badge", style: {
                                                        background: `${outcomeColors[c.outcome] || 'var(--text-muted)'}20`,
                                                        color: outcomeColors[c.outcome] || 'var(--text-muted)',
                                                    }, children: outcomeLabels[c.outcome] || c.outcome }) }), _jsx("td", { children: c.duration_seconds
                                                    ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, '0')}`
                                                    : '—' })] }, c.id));
                                }) })] }))] })] }));
}
