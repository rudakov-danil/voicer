import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTerms } from '@/lib/terms';
import { outcomeColor, outcomeLabel } from '@/lib/outcomes';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/api/analytics';
import { DonutChartWidget } from '@/components/charts/DonutChartWidget';
import { BarChartWidget } from '@/components/charts/BarChartWidget';
import { dashboardApi } from '@/api/dashboard';
import { useInsights, StoreConversion, Drivers, Funnel, HourlyLoad, PriceAnswers, TalkScatter, } from '@/components/analytics/Insights';
import { t } from '@/i18n';
function InfoTooltip({ children }) {
    const triggerRef = useRef(null);
    const [coords, setCoords] = useState(null);
    const show = () => {
        const el = triggerRef.current;
        if (!el)
            return;
        const r = el.getBoundingClientRect();
        const tooltipWidth = 260;
        let left = r.left + r.width / 2 - tooltipWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
        setCoords({ top: r.bottom + 8, left });
    };
    const hide = () => setCoords(null);
    return (_jsxs(_Fragment, { children: [_jsx("span", { ref: triggerRef, onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, tabIndex: 0, style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'help',
                    outline: 'none',
                }, children: "?" }), coords && createPortal(_jsx("span", { role: "tooltip", style: {
                    position: 'fixed',
                    top: coords.top,
                    left: coords.left,
                    zIndex: 10000,
                    width: 260,
                    padding: '10px 12px',
                    background: 'var(--bg-card)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                    fontSize: 12,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    textAlign: 'left',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    whiteSpace: 'normal',
                    pointerEvents: 'none',
                }, children: children }), document.body)] }));
}
// Категориальная палитра концепта: три основных цвета, дальше — шкала и нейтральные
const OBJECTION_COLORS = {
    price: '#4C6EF5', competitors: '#EB6834', timing: '#1BAF7A',
    functionality: '#5873EC', not_ready: '#E8A317', quality: '#97ADFC', trust: '#5F6778',
};
const OBJECTION_LABELS = {
    price: 'Цена', not_ready: 'Не готов сейчас', competitors: 'Конкуренты',
    functionality: 'Функционал', quality: 'Качество', trust: 'Доверие', timing: 'Сроки',
};
const FUNNEL_COLORS = ['#5873EC', '#7890F6', '#97ADFC', '#B4C4FF', '#D2DCFF', '#12A150'];
export function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState('objections');
    const { period } = useOutletContext();
    const { data: insights } = useInsights(period);
    const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: () => dashboardApi.getTrends({ weeks: 12 }) });
    return (_jsxs("div", { children: [_jsxs("div", { className: "an-a", children: [_jsx(StoreConversion, { trends: trends }), _jsx(Drivers, { data: insights })] }), _jsxs("div", { className: "an-b", children: [_jsx(Funnel, { data: insights }), _jsx(HourlyLoad, { data: insights })] }), _jsxs("div", { className: "an-c", children: [_jsx(PriceAnswers, { data: insights }), _jsx(TalkScatter, { data: insights })] }), _jsx("h2", { className: "an-section", children: t('Подробные отчёты') }), _jsx("div", { className: "tabs fade-in", children: ['objections', 'conversion', 'sentiment'].map((tab) => (_jsx("button", { className: `tab ${activeTab === tab ? 'active' : ''}`, onClick: () => setActiveTab(tab), children: tab === 'objections' ? 'Возражения' : tab === 'conversion' ? 'Конверсия' : 'Сентимент' }, tab))) }), activeTab === 'objections' && _jsx(ObjectionsTab, { period: period }), activeTab === 'conversion' && _jsx(ConversionTab, { period: period }), activeTab === 'sentiment' && _jsx(SentimentTab, {})] }));
}
function ObjectionsTab({ period }) {
    const { data: distribution } = useQuery({
        queryKey: ['objections-dist', period],
        queryFn: () => analyticsApi.getObjectionsDistribution({ period }),
    });
    const { data: resolution } = useQuery({
        queryKey: ['objections-resolution', period],
        queryFn: () => analyticsApi.getObjectionsResolution({ period }),
    });
    const { data: impact } = useQuery({
        queryKey: ['objections-impact', period],
        queryFn: () => analyticsApi.getObjectionsImpact({ period }),
    });
    const donutData = (distribution || []).map((d) => ({
        name: OBJECTION_LABELS[d.type] || d.type,
        value: d.count,
        color: OBJECTION_COLORS[d.type] || '#94A3B8',
    }));
    const maxCount = Math.max(...(distribution || []).map((d) => d.count), 1);
    const baseline = impact?.baseline_conversion ?? 0;
    return (_jsxs("div", { className: "fade-in", children: [_jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0439" }), _jsx("div", { className: "card-subtitle", children: "\u0422\u043E\u043F-7 \u0442\u0438\u043F\u043E\u0432 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" })] }) }), (distribution || []).map((d, i) => (_jsxs("div", { className: "objection-row", children: [_jsx("div", { className: "objection-label", children: OBJECTION_LABELS[d.type] || d.type }), _jsx("div", { className: "objection-bar-wrap", children: _jsx("div", { className: "objection-bar-fill", style: {
                                                width: `${(d.count / maxCount) * 100}%`,
                                                background: OBJECTION_COLORS[d.type] || '#94A3B8',
                                            } }) }), _jsx("div", { className: "objection-count", children: d.count })] }, i))), (!distribution || distribution.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u043E \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F\u0445" }) }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043F\u043E \u0442\u0438\u043F\u0443" }), _jsx("div", { className: "card-subtitle", children: "\u041A\u0440\u0443\u0433\u043E\u0432\u0430\u044F \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430" })] }) }), donutData.length > 0 ? (_jsx(DonutChartWidget, { data: donutData, valueSuffix: " \u0448\u0442." })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" }) }))] })] }), _jsxs("div", { className: "card", style: { marginTop: 24 }, children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "% \u043E\u0442\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043D\u044B\u0445 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u043F\u043E \u0442\u0438\u043F\u0443" }), _jsx("div", { className: "card-subtitle", children: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u0438\u0437 \u044D\u0442\u043E\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u044C" })] }) }), (resolution || []).map((r, i) => (_jsxs("div", { className: "objection-row", children: [_jsx("div", { className: "objection-label", children: OBJECTION_LABELS[r.type] || r.type }), _jsx("div", { className: "objection-bar-wrap", children: _jsx("div", { className: "objection-bar-fill", style: {
                                        width: `${r.resolution_rate}%`,
                                        background: r.resolution_rate >= 70 ? 'var(--success)'
                                            : r.resolution_rate >= 40 ? 'var(--warning)' : 'var(--danger)',
                                    } }) }), _jsxs("div", { className: "objection-count", style: { minWidth: 90, textAlign: 'right' }, children: [r.resolved, "/", r.total, " (", r.resolution_rate, "%)"] })] }, i))), (!resolution || resolution.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] }), _jsxs("div", { className: "card", style: { marginTop: 24 }, children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0412\u043B\u0438\u044F\u043D\u0438\u0435 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0430 \u0441\u0434\u0435\u043B\u043A\u0443" }), _jsxs("div", { className: "card-subtitle", children: ["\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u0432 \u043F\u043E\u043A\u0443\u043F\u043A\u0443 \u0441\u0440\u0435\u0434\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432 \u0441 \u044D\u0442\u0438\u043C \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C", baseline > 0 && _jsxs(_Fragment, { children: [" \u00B7 \u0431\u0430\u0437\u043E\u0432\u0430\u044F \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u043F\u043E \u043F\u0435\u0440\u0438\u043E\u0434\u0443: ", _jsxs("b", { children: [baseline, "%"] })] })] })] }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0422\u0438\u043F \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F" }), _jsx("th", { children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("th", { children: "\u041F\u043E\u043A\u0443\u043F\u043A\u0430" }), _jsx("th", { children: "\u041E\u0442\u043A\u0430\u0437" }), _jsx("th", { children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F" }), _jsx("th", { children: _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: ["\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u043E\u0442 \u0431\u0430\u0437\u044B", _jsxs(InfoTooltip, { children: ["\u041D\u0430 \u0441\u043A\u043E\u043B\u044C\u043A\u043E ", _jsx("b", { children: "\u043F\u0440\u043E\u0446\u0435\u043D\u0442\u043D\u044B\u0445 \u043F\u0443\u043D\u043A\u0442\u043E\u0432" }), " (\u043F.\u043F.) \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u043F\u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u043C \u0441 \u044D\u0442\u0438\u043C \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F \u043E\u0442 \u0431\u0430\u0437\u043E\u0432\u043E\u0439 \u043F\u043E \u043F\u0435\u0440\u0438\u043E\u0434\u0443.", _jsx("br", {}), _jsx("br", {}), _jsx("span", { style: { color: 'var(--success)' }, children: "+" }), " \u2014 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u043C\u0435\u0448\u0430\u0435\u0442,", ' ', _jsx("span", { style: { color: 'var(--danger)' }, children: "\u2212" }), " \u2014 \u0440\u0435\u0436\u0435\u0442 \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044E."] })] }) })] }) }), _jsxs("tbody", { children: [(impact?.items || []).map((c, i) => {
                                            const delta = c.conversion - baseline;
                                            return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: 'var(--text)' }, children: OBJECTION_LABELS[c.type] || c.type }), _jsx("td", { children: c.conversations }), _jsx("td", { children: c.purchases }), _jsx("td", { children: c.refusals }), _jsxs("td", { style: {
                                                            fontWeight: 600,
                                                            color: c.conversion >= 40 ? 'var(--success)' : c.conversion >= 20 ? 'var(--warning)' : 'var(--danger)',
                                                        }, children: [c.conversion, "%"] }), _jsxs("td", { style: {
                                                            fontWeight: 600,
                                                            color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)',
                                                        }, children: [delta > 0 ? '+' : '', delta.toFixed(1), " \u043F.\u043F."] })] }, i));
                                        }), (!impact?.items || impact.items.length === 0) && (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: _jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }) }) }))] })] }) })] })] }));
}
function ConversionTab({ period }) {
    const terms = useTerms();
    const { data: funnel } = useQuery({
        queryKey: ['conversion-funnel', period],
        queryFn: () => analyticsApi.getConversionFunnel({ period }),
    });
    const { data: byStore } = useQuery({
        queryKey: ['conversion-store', period],
        queryFn: () => analyticsApi.getConversionByStore({ period }),
    });
    const { data: bySeller } = useQuery({
        queryKey: ['conversion-seller', period],
        queryFn: () => analyticsApi.getConversionBySeller({ period }),
    });
    const { data: outcomes } = useQuery({
        queryKey: ['conversion-outcomes', period],
        queryFn: () => analyticsApi.getConversionOutcomes({ period }),
    });
    const { data: handling } = useQuery({
        queryKey: ['conversion-handling', period],
        queryFn: () => analyticsApi.getObjectionHandlingImpact({ period }),
    });
    const storeChartData = (byStore || []).map((s) => ({
        label: s.store_name,
        value: Math.round(s.conversion_rate * 100),
    }));
    const sellerChartData = (bySeller || []).map((s) => ({
        label: s.seller_name,
        value: Math.round(s.conversion_rate * 100),
    }));
    const outcomeDonut = (outcomes || []).map((o) => ({
        name: outcomeLabel(o.outcome),
        value: o.count,
        color: outcomeColor(o.outcome),
    }));
    const handlingRows = [
        { key: 'no_objections', label: 'Без возражений', tone: 'var(--text-muted)' },
        { key: 'all_resolved', label: 'Все возражения отработаны', tone: 'var(--success)' },
        { key: 'some_unresolved', label: 'Есть неотработанные', tone: 'var(--danger)' },
    ];
    return (_jsxs("div", { className: "fade-in", children: [_jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-header", children: [_jsx("div", { className: "card-title", children: "\u0412\u043E\u0440\u043E\u043D\u043A\u0430 \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u0438" }), _jsx("div", { className: "card-subtitle", children: "\u042D\u0442\u0430\u043F\u044B \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u2014 % \u043E\u0442 \u0432\u0441\u0435\u0445 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" })] }), (funnel || []).map((stage, i) => (_jsxs("div", { style: { marginBottom: '12px', opacity: stage.count === 0 ? 0.45 : 1 }, children: [_jsxs("div", { style: {
                                            display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
                                            fontSize: '13px',
                                        }, children: [_jsx("span", { style: { color: 'var(--text)' }, children: stage.stage }), _jsxs("span", { style: { color: 'var(--text-muted)' }, children: [stage.count.toLocaleString('ru-RU'), " (", stage.percentage, "%)"] })] }), _jsx("div", { className: "progress-bar", children: _jsx("div", { className: "progress-bar-fill", style: {
                                                width: `${Math.max(stage.percentage, 2)}%`,
                                                background: FUNNEL_COLORS[i] || '#5873EC',
                                            } }) })] }, i))), (!funnel || funnel.length === 0) && (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043E\u0432" }), _jsx("div", { className: "card-subtitle", children: "\u0427\u0435\u043C \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u044B" })] }) }), outcomeDonut.length > 0 ? (_jsx(DonutChartWidget, { data: outcomeDonut, valueSuffix: " \u0448\u0442." })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] })] }), _jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsxs("div", { className: "card-title", children: ["\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F ", terms.isTelephony ? 'по отделам' : 'по магазинам'] }), _jsx("div", { className: "card-subtitle", children: "% \u043F\u043E\u043A\u0443\u043F\u043E\u043A \u043E\u0442 \u0432\u0441\u0435\u0445 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" })] }) }), storeChartData.length > 0 ? (_jsx(BarChartWidget, { data: storeChartData, valueLabel: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F", valueSuffix: "%" })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u043F\u043E \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430\u043C" }), _jsx("div", { className: "card-subtitle", children: "\u0422\u043E\u043F-10 \u2014 % \u043F\u043E\u043A\u0443\u043F\u043E\u043A" })] }) }), sellerChartData.length > 0 ? (_jsx(BarChartWidget, { data: sellerChartData, valueLabel: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F", valueSuffix: "%" })) : (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0430" }) }))] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("div", { className: "card-title", children: "\u0412\u043B\u0438\u044F\u043D\u0438\u0435 \u0440\u0430\u0431\u043E\u0442\u044B \u0441 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F\u043C\u0438" }), _jsx("div", { className: "card-subtitle", children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F \u0432 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438 \u043E\u0442 \u0442\u043E\u0433\u043E, \u043A\u0430\u043A \u043F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u043E\u0442\u0440\u0430\u0431\u043E\u0442\u0430\u043B \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F" })] }) }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0413\u0440\u0443\u043F\u043F\u0430" }), _jsx("th", { children: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432" }), _jsx("th", { children: "\u041F\u043E\u043A\u0443\u043F\u043A\u0430" }), _jsx("th", { children: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F" })] }) }), _jsx("tbody", { children: handlingRows.map(({ key, label, tone }) => {
                                        const bucket = handling?.[key];
                                        const rate = bucket ? Math.round(bucket.conversion_rate * 100) : 0;
                                        return (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500, color: tone }, children: label }), _jsx("td", { children: bucket?.total ?? 0 }), _jsx("td", { children: bucket?.purchases ?? 0 }), _jsxs("td", { style: { fontWeight: 600, color: tone }, children: [rate, "%"] })] }, key));
                                    }) })] }) })] })] }));
}
function SentimentTab() {
    return (_jsx("div", { className: "fade-in", children: _jsxs("div", { className: "card", style: { textAlign: 'center', padding: '64px 24px' }, children: [_jsx("div", { style: { fontSize: '48px', marginBottom: '16px' }, children: "\uD83D\uDEA7" }), _jsx("div", { className: "card-title", style: { fontSize: '20px', marginBottom: '8px' }, children: "\u0421\u043A\u043E\u0440\u043E \u0431\u0443\u0434\u0435\u0442" }), _jsx("div", { className: "card-subtitle", style: { maxWidth: '480px', margin: '0 auto' }, children: "\u0410\u043D\u0430\u043B\u0438\u0437 \u0442\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u0438 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432 \u0438 \u0434\u0438\u043D\u0430\u043C\u0438\u043A\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0438\u0439 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0432 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u043C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438." })] }) }));
}
