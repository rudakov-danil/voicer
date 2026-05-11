import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
export function DonutChartWidget({ data, height = 240 }) {
    return (_jsx(ResponsiveContainer, { width: "100%", height: height, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: data, cx: "50%", cy: "50%", innerRadius: 60, outerRadius: 80, paddingAngle: 2, dataKey: "value", children: data.map((entry, index) => (_jsx(Cell, { fill: entry.color }, `cell-${index}`))) }), _jsx(Tooltip, { contentStyle: {
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px'
                    }, labelStyle: { color: 'var(--text)' } }), _jsx(Legend, {})] }) }));
}
