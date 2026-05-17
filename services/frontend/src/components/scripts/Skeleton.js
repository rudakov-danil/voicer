import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SkeletonLine({ width = '100%', height = 12, style }) {
    return (_jsx("div", { className: "skeleton-line", style: { width, height, ...style } }));
}
export function SkeletonScriptCard() {
    return (_jsxs("div", { className: "skeleton-script-card", children: [_jsx("div", { className: "skeleton-circle" }), _jsxs("div", { style: { flex: 1 }, children: [_jsx(SkeletonLine, { width: "60%", height: 13 }), _jsx(SkeletonLine, { width: "40%", height: 10, style: { marginTop: 6 } })] }), _jsx("div", { className: "skeleton-toggle" })] }));
}
export function SkeletonAnalyticsRow() {
    return (_jsxs("div", { className: "skeleton-analytics-row", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsx(SkeletonLine, { width: "40%", height: 13 }), _jsx(SkeletonLine, { width: "22%", height: 13 })] }), _jsx(SkeletonLine, { width: "100%", height: 6 })] }));
}
