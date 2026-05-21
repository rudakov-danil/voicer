import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function VoicerLogo({ size = 22, light = false }) {
    // Aspect ratio matches the source 90×110 SVG.
    const w = size;
    const h = Math.round(size * (110 / 90));
    const dark = light ? '#FFFFFF' : '#0B0E14';
    return (_jsxs("svg", { width: w, height: h, viewBox: "0 0 90 110", fill: "none", "aria-hidden": "true", children: [_jsx("rect", { x: "0", y: "37.4", width: "10", height: "35.2", rx: "5", fill: dark, opacity: "0.5" }), _jsx("rect", { x: "20", y: "22", width: "10", height: "66", rx: "5", fill: dark, opacity: "0.75" }), _jsx("rect", { x: "40", y: "2.75", width: "10", height: "104.5", rx: "5", fill: "#2E5BFF" }), _jsx("rect", { x: "60", y: "27.5", width: "10", height: "55", rx: "5", fill: dark, opacity: "0.65" }), _jsx("rect", { x: "80", y: "41.25", width: "10", height: "27.5", rx: "5", fill: dark, opacity: "0.4" })] }));
}
