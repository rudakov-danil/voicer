import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect } from 'react';
import { X } from 'lucide-react';
export function Drawer({ isOpen, onClose, title, children }) {
    // Esc закрывает панель, как и крестик
    useEffect(() => {
        if (!isOpen)
            return;
        const onKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `drawer-overlay ${isOpen ? 'open' : ''}`, onClick: onClose }), _jsxs("div", { className: `drawer ${isOpen ? 'open' : ''}`, children: [_jsxs("div", { className: "drawer-header", children: [_jsx("h2", { className: "drawer-title", children: title }), _jsx("button", { className: "icon-btn drawer-close", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 20 }) })] }), _jsx("div", { className: "drawer-body", children: children })] })] }));
}
