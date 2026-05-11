import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/api/analytics';
import { DonutChartWidget } from '@/components/charts/DonutChartWidget';
import { BarChartWidget } from '@/components/charts/BarChartWidget';
import { LineChartWidget } from '@/components/charts/LineChartWidget';
const OBJECTION_COLORS = {
    price: '#EF4444', not_ready: '#F59E0B', competitors: '#3B82F6',
    functionality: '#8B5CF6', quality: '#EC4899', trust: '#10B981', timing: '#6366F1',
};
const OBJECTION_LABELS = {
    price: 'Цена', not_ready: 'Не готов сейчас', competitors: 'Конкуренты',
    functionality: 'Функционал', quality: 'Качество', trust: 'Доверие', timing: 'Сроки',
};
export function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState('objections');
    const { period } = useOutletContext();
    return (_jsxs("div", { children: [_jsx("div", { className: "tabs fade-in", children: ['objections', 'conversion', 'sentiment'].map((tab) => (_jsx("button", { className: `tab ${activeTab === tab ? 'active' : ''}`, onClick: () => setActiveTab(tab), children: tab === 'objections' ? 'Возражения' : tab === 'conversion' ? 'Конверсия' : 'Сентимент' }, tab))) }), activeTab === 'objections' && _jsx(ObjectionsTab, { period: period }), activeTab === 'conversion' && _jsx(ConversionTab, { period: period }), activeTab === 'sentiment' && _jsx(SentimentTab, { period: period })] }));
}
function ObjectionsTab({ period }) {
    const { data: distribution } = useQuery({
        queryKey: ['objections-dist', period],
        queryFn: () => analyticsApi.getObjectionsDistribution({ period }),
    });
    const { data: correlation } = useQuery({
        queryKey: ['objections-corr', period],
        queryFn: () => analyticsApi.getObjectionsCorrelation({ period }),
    });
    const donutData = (distribution || []).map((d) => ({
        name: OBJECTION_LABELS[d.type] || d.type,
        value: d.count,
        color: OBJECTION_COLORS[d.type] || '#94A3B8',
    }));
    const maxCount = Math.max(...(distribution || []).map((d) => d.count), 1);
    return (_jsxs("div", { className: "fade-in", children: [_jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0439" }), _jsx("div", { className: "card-subtitle", children: "\u0422\u043E\u043F-7 \u0442\u0438\u043F\u043E\u0432 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" })] }) }), (distribution || []).map((d, i) => (_jsxs("div", { className: "objection-row", children: [_jsx("div", { className: "objection-label", children: OBJECTION_LABELS[d.type] || d.type }), _jsx("div", { className: "objection-bar-wrap", children: _jsx("div", { className: "objection-bar-fill", style: {
                                                width: `${(d.count / maxCount) * 100}%`,
                                                background: OBJECTION_COLORS[d.type] || '#94A3B8',
                                            } }) }), _jsx("div", { className: "objection-count", children: d.count })] }, i))), (!distribution || distribution.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F\u0445" }) }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043F\u043E \u0442\u0438\u043F\u0443" }), _jsx("div", { className: "card-subtitle", children: "\u041A\u0440\u0443\u0433\u043E\u0432\u0430\u044F \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430" })] }) }), donutData.length > 0 ? (_jsx(DonutChartWidget, { data: donutData })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" }) }))] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("div", { className: "card-title", children: "\u041A\u043E\u0440\u0440\u0435\u043B\u044F\u0446\u0438\u044F \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u0441 \u0438\u0441\u0445\u043E\u0434\u043E\u043C \u043F\u0440\u043E\u0434\u0430\u0436\u0438" }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0422\u0438\u043F \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F" }), _jsx("th", { children: "\u0412\u0441\u0435\u0433\u043E" }), _jsx("th", { children: "\u041F\u043E\u043A\u0443\u043F\u043A\u0430" }), _jsx("th", { children: "\u041E\u0442\u043A\u0430\u0437" }), _jsx("th", { children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u043F\u043E\u0441\u043B\u0435 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F" }), _jsx("th", { children: "\u041B\u0443\u0447\u0448\u0430\u044F \u0442\u0435\u0445\u043D\u0438\u043A\u0430" })] }) }), _jsx("tbody", { children: (correlation || []).map((c, i) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: OBJECTION_LABELS[c.type] || c.type }), _jsx("td", { children: c.total }), _jsx("td", { children: c.purchases }), _jsx("td", { children: c.refusals }), _jsxs("td", { style: {
                                                    fontWeight: 600,
                                                    color: c.conversion_after >= 40 ? 'var(--success)' : c.conversion_after >= 25 ? 'var(--warning)' : 'var(--danger)',
                                                }, children: [c.conversion_after, "%"] }), _jsx("td", { children: _jsx("span", { className: "tag tag-primary", children: c.best_technique }) })] }, i))) })] }) })] })] }));
}
function ConversionTab({ period }) {
    const { data: funnel } = useQuery({
        queryKey: ['conversion-funnel', period],
        queryFn: () => analyticsApi.getConversionFunnel({ period }),
    });
    const { data: byStore } = useQuery({
        queryKey: ['conversion-store', period],
        queryFn: () => analyticsApi.getConversionByStore({ period }),
    });
    const storeChartData = (byStore || []).map((s) => ({
        label: s.store_name,
        value: Math.round(s.conversion_rate * 100),
    }));
    const FUNNEL_COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'];
    return (_jsx("div", { className: "fade-in", children: _jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("div", { className: "card-title", children: "\u0412\u043E\u0440\u043E\u043D\u043A\u0430 \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u0438" }) }), (funnel || []).map((stage, i) => (_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsxs("div", { style: {
                                        display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
                                        fontSize: '13px',
                                    }, children: [_jsx("span", { style: { color: 'var(--text)' }, children: stage.stage }), _jsxs("span", { style: { color: 'var(--text-muted)' }, children: [stage.count.toLocaleString('ru-RU'), " (", stage.percentage, "%)"] })] }), _jsx("div", { className: "progress-bar", children: _jsx("div", { className: "progress-bar-fill", style: { width: `${stage.percentage}%`, background: FUNNEL_COLORS[i] || '#2563EB' } }) })] }, i))), (!funnel || funnel.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("div", { className: "card-title", children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u043F\u043E \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430\u043C" }) }), storeChartData.length > 0 ? (_jsx(BarChartWidget, { data: storeChartData })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] })] }) }));
}
function SentimentTab({ period }) {
    const { data: sentiment } = useQuery({
        queryKey: ['sentiment', period],
        queryFn: () => analyticsApi.getSentiment({ period }),
    });
    const { data: trend } = useQuery({
        queryKey: ['sentiment-trend', period],
        queryFn: () => analyticsApi.getSentimentTrend({ period }),
    });
    const pos = sentiment?.positive || 0;
    const neu = sentiment?.neutral || 0;
    const neg = sentiment?.negative || 0;
    const total = pos + neu + neg || 1;
    return (_jsxs("div", { className: "fade-in", children: [_jsxs("div", { className: "card", style: { marginBottom: '24px' }, children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0441\u0435\u043D\u0442\u0438\u043C\u0435\u043D\u0442\u0430" }), _jsx("div", { className: "card-subtitle", children: "\u041F\u043E \u0432\u0441\u0435\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" })] }) }), _jsxs("div", { className: "sentiment-bar", style: { height: '12px', marginBottom: '12px' }, children: [_jsx("div", { className: "sentiment-positive", style: { width: `${(pos / total) * 100}%` } }), _jsx("div", { className: "sentiment-neutral", style: { width: `${(neu / total) * 100}%` } }), _jsx("div", { className: "sentiment-negative", style: { width: `${(neg / total) * 100}%` } })] }), _jsxs("div", { style: { display: 'flex', gap: '20px', fontSize: '12px' }, children: [_jsxs("span", { children: ["\u25CF ", _jsxs("span", { style: { color: 'var(--success)' }, children: ["\u041F\u043E\u0437\u0438\u0442\u0438\u0432\u043D\u044B\u0439 ", Math.round((pos / total) * 100), "%"] })] }), _jsxs("span", { children: ["\u25CF ", _jsxs("span", { style: { color: 'var(--text-muted)' }, children: ["\u041D\u0435\u0439\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0439 ", Math.round((neu / total) * 100), "%"] })] }), _jsxs("span", { children: ["\u25CF ", _jsxs("span", { style: { color: 'var(--danger)' }, children: ["\u041D\u0435\u0433\u0430\u0442\u0438\u0432\u043D\u044B\u0439 ", Math.round((neg / total) * 100), "%"] })] })] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsx("div", { className: "card-title", children: "\u0414\u0438\u043D\u0430\u043C\u0438\u043A\u0430 \u0441\u0435\u043D\u0442\u0438\u043C\u0435\u043D\u0442\u0430 \u043F\u043E \u043D\u0435\u0434\u0435\u043B\u044F\u043C" }) }), trend && trend.length > 0 ? (_jsx(LineChartWidget, { data: trend.map((t) => ({ label: t.week, value: t.positive })), color: "#16A34A" })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] })] }));
}
