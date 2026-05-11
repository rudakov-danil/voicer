import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
export function BarChartWidget({ data, color = '#2563EB', height = 240 }) {
    const chartData = data.map((d) => ({
        name: d.label,
        value: d.value
    }));
    return (_jsx(ResponsiveContainer, { width: "100%", height: height, children: _jsxs(BarChart, { data: chartData, margin: { top: 5, right: 30, left: 0, bottom: 5 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--border)" }), _jsx(XAxis, { dataKey: "name", stroke: "var(--text-muted)", style: { fontSize: '12px' } }), _jsx(YAxis, { stroke: "var(--text-muted)", style: { fontSize: '12px' } }), _jsx(Tooltip, { contentStyle: {
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px'
                    }, labelStyle: { color: 'var(--text)' } }), _jsx(Bar, { dataKey: "value", fill: color, radius: [8, 8, 0, 0] })] }) }));
}
