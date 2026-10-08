import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
const listeners = new Set();
export function toast(msg) {
    listeners.forEach((fn) => fn(msg));
}
export function Toaster() {
    const [msg, setMsg] = useState('');
    const [on, setOn] = useState(false);
    const timer = useRef(0);
    useEffect(() => {
        const show = (m) => {
            setMsg(m);
            requestAnimationFrame(() => setOn(true));
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setOn(false), 2600);
        };
        listeners.add(show);
        return () => { listeners.delete(show); window.clearTimeout(timer.current); };
    }, []);
    return (_jsx("div", { className: `toast ${on ? 'is-on' : ''}`, role: "status", "aria-live": "polite", children: msg && _jsxs(_Fragment, { children: [_jsx(Check, { size: 16, "aria-hidden": "true" }), _jsx("span", { children: msg })] }) }));
}
