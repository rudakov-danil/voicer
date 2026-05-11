import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard';
import { SellerDrawer } from '@/components/SellerDrawer';
import { ScoreBadge } from '@/components/ScoreBadge';
import { useState } from 'react';
const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#6366F1'];
export function TeamPage() {
    const [selectedSellerId, setSelectedSellerId] = useState(null);
    const { data: sellers } = useQuery({
        queryKey: ['sellers'],
        queryFn: () => dashboardApi.getSellers(),
    });
    const sorted = (sellers || []).slice().sort((a, b) => (b.conversion_rate || 0) - (a.conversion_rate || 0));
    const total = sellers?.length || 0;
    const avgScore = total ? Math.round(sellers.reduce((s, x) => s + (x.avg_score || 0), 0) / total) : 0;
    const maxConv = sorted[0]?.conversion_rate || 0;
    const minConv = sorted[sorted.length - 1]?.conversion_rate || 0;
    const gap = minConv > 0 ? (maxConv / minConv).toFixed(1) : '—';
    // Store aggregation
    const storeMap = new Map();
    sellers?.forEach((s) => {
        const key = s.store_name || s.store_id;
        const e = storeMap.get(key) || { name: key, count: 0, totalScore: 0, totalConv: 0, totalCheck: 0 };
        e.count++;
        e.totalScore += s.avg_score || 0;
        e.totalConv += s.conversion_rate || 0;
        storeMap.set(key, e);
    });
    return (_jsxs("div", { children: [_jsxs("div", { className: "metrics-grid fade-in", style: { gridTemplateColumns: 'repeat(3, 1fr)' }, children: [_jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432 \u0432 \u0441\u0435\u0442\u0438" }), _jsx("div", { className: "metric-value", children: total })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsxs("div", { className: "metric-value", children: [avgScore, "%"] }), _jsx("div", { className: "metric-change up", children: "\u2191 3%" })] }), _jsxs("div", { className: "metric-card", children: [_jsx("div", { className: "metric-label", children: "\u0420\u0430\u0437\u0431\u0440\u043E\u0441 \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u0438 (\u043B\u0443\u0447\u0448\u0438\u0439/\u0445\u0443\u0434\u0448\u0438\u0439)" }), _jsxs("div", { className: "metric-value", children: [gap, "x"] })] })] }), _jsxs("div", { className: "grid-2 fade-in", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("div", { children: _jsx("div", { className: "card-title", children: "\u0420\u0435\u0439\u0442\u0438\u043D\u0433 \u043F\u043E \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u0438" }) }) }), _jsx("div", { children: sorted.map((seller, i) => {
                                    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'other';
                                    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                                    const convPct = Math.round((seller.conversion_rate || 0) * 100);
                                    return (_jsxs("div", { className: "leaderboard-item", style: { cursor: 'pointer' }, onClick: () => setSelectedSellerId(seller.id), children: [_jsx("div", { className: `leaderboard-rank ${rankClass}`, children: i + 1 }), _jsxs("div", { className: "avatar", style: {
                                                    background: color, width: 36, height: 36, borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'white', fontSize: '12px', fontWeight: 600, flexShrink: 0,
                                                }, children: [seller.first_name[0], seller.last_name[0]] }), _jsxs("div", { className: "leaderboard-info", children: [_jsxs("div", { className: "leaderboard-name", children: [seller.first_name, " ", seller.last_name, seller.conversations_count !== undefined && seller.conversations_count < 20 && (_jsx("span", { className: "tag tag-primary", style: { marginLeft: 6, fontSize: '10px', padding: '1px 6px' }, children: "\u041D\u043E\u0432\u0438\u0447\u043E\u043A" }))] }), _jsx("div", { className: "leaderboard-store", children: seller.store_name || seller.store_id })] }), _jsxs("div", { style: { textAlign: 'right' }, children: [_jsxs("div", { className: "leaderboard-score", style: {
                                                            color: convPct >= 35 ? 'var(--success)' : convPct >= 25 ? 'var(--warning)' : 'var(--danger)',
                                                        }, children: [convPct, "%"] }), _jsxs("div", { style: { fontSize: '11px', color: 'var(--text-muted)' }, children: [seller.conversations_count || 0, " \u0440\u0430\u0437\u0433."] })] })] }, seller.id));
                                }) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("div", { children: _jsx("div", { className: "card-title", children: "\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043F\u043E \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430\u043C" }) }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsx("th", { children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0446\u043E\u0432" }), _jsx("th", { children: "\u0421\u0440. \u0441\u043A\u043E\u0440\u0438\u043D\u0433" }), _jsx("th", { children: "\u0421\u0440. \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F" })] }) }), _jsx("tbody", { children: Array.from(storeMap.entries()).map(([storeId, data]) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: storeId }), _jsx("td", { children: data.count }), _jsx("td", { children: _jsx(ScoreBadge, { score: Math.round(data.totalScore / data.count) }) }), _jsxs("td", { children: [Math.round((data.totalConv / data.count) * 100), "%"] })] }, storeId))) })] }) })] })] }), _jsx(SellerDrawer, { sellerId: selectedSellerId, onClose: () => setSelectedSellerId(null) })] }));
}
