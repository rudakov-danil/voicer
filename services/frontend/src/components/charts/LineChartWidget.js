import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
export function LineChartWidget({ data, color = '#2563EB', height = 240 }) {
    const chartData = data.map((d) => ({
        name: d.label,
        value: d.value
    }));
    return (_jsx(ResponsiveContainer, { width: "100%", height: height, children: _jsxs(LineChart, { data: chartData, margin: { top: 5, right: 30, left: 0, bottom: 5 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--border)" }), _jsx(XAxis, { dataKey: "name", stroke: "var(--text-muted)", style: { fontSize: '12px' } }), _jsx(YAxis, { stroke: "var(--text-muted)", style: { fontSize: '12px' } }), _jsx(Tooltip, { contentStyle: {
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px'
                    }, labelStyle: { color: 'var(--text)' } }), _jsx(Line, { type: "monotone", dataKey: "value", stroke: color, strokeWidth: 2, dot: { fill: color, r: 4 }, activeDot: { r: 6 } })] }) }));
}
