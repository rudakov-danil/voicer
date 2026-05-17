import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Plus, Sparkles, Search, BookOpen, MapPin } from 'lucide-react';
export function CommandPalette({ scripts, onCreate, onOpenLibrary, onSelectScript, onJumpAssignments }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);
    useEffect(() => {
        const onKey = (e) => {
            const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
            if (isCmdK) {
                e.preventDefault();
                setOpen((v) => !v);
                setQ('');
                setActive(0);
                return;
            }
            if (!open)
                return;
            if (e.key === 'Escape') {
                setOpen(false);
                return;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    const commands = useMemo(() => {
        const fixed = [
            {
                id: 'create',
                label: 'Создать новый скрипт',
                hint: 'C',
                icon: _jsx(Plus, { size: 14 }),
                onRun: () => { setOpen(false); onCreate(); },
            },
            {
                id: 'library',
                label: 'Открыть библиотеку шаблонов / AI',
                hint: 'L',
                icon: _jsx(Sparkles, { size: 14 }),
                onRun: () => { setOpen(false); onOpenLibrary(); },
            },
        ];
        const scriptCmds = scripts.map((s) => ({
            id: `open:${s.id}`,
            label: `Открыть: ${s.name}`,
            hint: s.is_active ? 'активный' : 'черновик',
            icon: _jsx(CheckSquare, { size: 14 }),
            onRun: () => { setOpen(false); onSelectScript(s.id); },
        }));
        const assignCmds = scripts.map((s) => ({
            id: `assign:${s.id}`,
            label: `Назначить магазины: ${s.name}`,
            icon: _jsx(MapPin, { size: 14 }),
            onRun: () => { setOpen(false); onJumpAssignments(s.id); },
        }));
        return [...fixed, ...scriptCmds, ...assignCmds];
    }, [scripts, onCreate, onOpenLibrary, onSelectScript, onJumpAssignments]);
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s)
            return commands.slice(0, 30);
        return commands.filter((c) => c.label.toLowerCase().includes(s)).slice(0, 30);
    }, [q, commands]);
    const onListKey = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(filtered.length - 1, i + 1));
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            filtered[active]?.onRun();
        }
    };
    if (!open)
        return null;
    return createPortal(_jsx("div", { className: "cmdk-overlay", onClick: () => setOpen(false), children: _jsxs("div", { className: "cmdk-card", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "cmdk-search", children: [_jsx(Search, { size: 14 }), _jsx("input", { autoFocus: true, value: q, onChange: (e) => { setQ(e.target.value); setActive(0); }, placeholder: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0438\u043B\u0438 \u0441\u043A\u0440\u0438\u043F\u0442\u2026", onKeyDown: onListKey }), _jsx("span", { className: "cmdk-kbd", children: "esc" })] }), _jsxs("div", { className: "cmdk-list", children: [filtered.map((c, i) => (_jsxs("div", { className: `cmdk-item ${i === active ? 'cmdk-item--active' : ''}`, onMouseEnter: () => setActive(i), onClick: c.onRun, children: [_jsx("span", { className: "cmdk-icon", children: c.icon || _jsx(BookOpen, { size: 14 }) }), _jsx("span", { className: "cmdk-label", children: c.label }), c.hint && _jsx("span", { className: "cmdk-hint", children: c.hint })] }, c.id))), filtered.length === 0 && (_jsx("div", { className: "cmdk-empty", children: "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }))] }), _jsxs("div", { className: "cmdk-footer", children: [_jsxs("span", { children: [_jsx("kbd", { children: "\u2191" }), _jsx("kbd", { children: "\u2193" }), " \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F"] }), _jsxs("span", { children: [_jsx("kbd", { children: "Enter" }), " \u0432\u044B\u0431\u0440\u0430\u0442\u044C"] }), _jsxs("span", { children: [_jsx("kbd", { children: "\u2318K" }), " \u0432\u044B\u0437\u043E\u0432"] })] })] }) }), document.body);
}
