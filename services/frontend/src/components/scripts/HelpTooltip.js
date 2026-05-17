import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
export function HelpTooltip({ content, size = 13, inline }) {
    const ref = useRef(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    useEffect(() => {
        if (!open || !ref.current)
            return;
        const r = ref.current.getBoundingClientRect();
        setPos({ top: r.bottom + 6, left: r.left });
    }, [open]);
    return (_jsxs(_Fragment, { children: [_jsx("span", { ref: ref, className: "help-icon", style: { verticalAlign: inline ? 'middle' : 'baseline' }, onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false), onClick: (e) => { e.stopPropagation(); setOpen((v) => !v); }, role: "button", tabIndex: 0, "aria-label": "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0430", children: _jsx(HelpCircle, { size: size }) }), open && pos && createPortal(_jsx("div", { className: "help-tooltip", style: { top: pos.top, left: pos.left }, onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false), children: content }), document.body)] }));
}
