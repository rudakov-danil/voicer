import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { X } from 'lucide-react';
export function Drawer({ isOpen, onClose, title, children }) {
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `drawer-overlay ${isOpen ? 'open' : ''}`, onClick: onClose }), _jsxs("div", { className: `drawer ${isOpen ? 'open' : ''}`, children: [_jsxs("div", { className: "drawer-header", children: [_jsx("h2", { className: "drawer-title", children: title }), _jsx("button", { className: "icon-btn drawer-close", onClick: onClose, children: _jsx(X, { size: 20 }) })] }), _jsx("div", { className: "drawer-body", children: children })] })] }));
}
