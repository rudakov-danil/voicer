import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
export function MultiSelect({ options, selected, onChange, placeholder = 'Выберите…', single = false, selectAllLabel, searchable, prependOption, disabled, popoverWidth, }) {
    const triggerRef = useRef(null);
    const popoverRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [pos, setPos] = useState(null);
    const showSearch = searchable ?? options.length > 5;
    // Click outside / Escape
    useEffect(() => {
        if (!open)
            return;
        const onDocClick = (e) => {
            const t = e.target;
            if (popoverRef.current?.contains(t))
                return;
            if (triggerRef.current?.contains(t))
                return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const reposition = useCallback(() => {
        const el = triggerRef.current;
        if (!el)
            return;
        const r = el.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left, width: popoverWidth ?? r.width });
    }, [popoverWidth]);
    useEffect(() => {
        if (!open)
            return;
        reposition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, reposition]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return options;
        return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q));
    }, [options, query]);
    const allIds = options.map((o) => o.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
    const toggle = (id) => {
        if (single) {
            onChange([id]);
            setOpen(false);
            return;
        }
        if (selected.includes(id)) {
            onChange(selected.filter((x) => x !== id));
        }
        else {
            onChange([...selected, id]);
        }
    };
    const toggleAll = () => onChange(allSelected ? [] : allIds);
    const selectedMap = useMemo(() => new Set(selected), [selected]);
    const selectedLabels = options.filter((o) => selectedMap.has(o.id));
    return (_jsxs(_Fragment, { children: [_jsxs("button", { ref: triggerRef, type: "button", className: `ms-trigger ${disabled ? 'ms-trigger--disabled' : ''} ${open ? 'ms-trigger--open' : ''}`, onClick: () => !disabled && setOpen((v) => !v), disabled: disabled, "aria-haspopup": "listbox", "aria-expanded": open, children: [_jsxs("span", { className: "ms-value", children: [selectedLabels.length === 0 && (_jsx("span", { className: "ms-placeholder", children: placeholder })), !single && selectedLabels.slice(0, 3).map((o) => (_jsxs("span", { className: "ms-chip", onClick: (e) => { e.stopPropagation(); toggle(o.id); }, children: [o.label, _jsx(X, { size: 11 })] }, o.id))), !single && selectedLabels.length > 3 && (_jsxs("span", { className: "ms-chip ms-chip--more", children: ["+", selectedLabels.length - 3] })), single && selectedLabels[0] && (_jsx("span", { className: "ms-single-value", children: selectedLabels[0].label }))] }), _jsx(ChevronDown, { size: 14, className: "ms-caret" })] }), open && pos && createPortal(_jsxs("div", { ref: popoverRef, className: "ms-popover", style: { top: pos.top, left: pos.left, width: pos.width }, role: "listbox", children: [showSearch && (_jsxs("div", { className: "ms-search", children: [_jsx(Search, { size: 13 }), _jsx("input", { autoFocus: true, value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A\u2026", onKeyDown: (e) => { if (e.key === 'Escape')
                                    setOpen(false); } })] })), _jsxs("div", { className: "ms-list", children: [!single && selectAllLabel && options.length > 0 && (_jsxs("div", { className: "ms-option ms-option--all", onClick: toggleAll, role: "option", "aria-selected": allSelected, children: [_jsx("span", { className: `ms-check ${allSelected ? 'ms-check--on' : ''}`, children: allSelected && _jsx(Check, { size: 11 }) }), _jsx("span", { className: "ms-option-label", children: selectAllLabel }), _jsx("span", { className: "ms-option-count", children: allIds.length })] })), prependOption && (_jsxs("div", { className: "ms-option", onClick: () => { onChange([prependOption.id]); setOpen(false); }, role: "option", "aria-selected": selected.length === 1 && selected[0] === prependOption.id, children: [_jsx("span", { className: `ms-check ${selected.length === 1 && selected[0] === prependOption.id ? 'ms-check--on' : ''}`, children: selected.length === 1 && selected[0] === prependOption.id && _jsx(Check, { size: 11 }) }), _jsx("span", { className: "ms-option-label", children: prependOption.label })] })), filtered.map((o) => {
                                const isSelected = selectedMap.has(o.id);
                                return (_jsxs("div", { className: `ms-option ${isSelected ? 'ms-option--selected' : ''}`, onClick: () => toggle(o.id), role: "option", "aria-selected": isSelected, children: [_jsx("span", { className: `ms-check ${isSelected ? 'ms-check--on' : ''}`, children: isSelected && _jsx(Check, { size: 11 }) }), _jsxs("span", { className: "ms-option-label", children: [o.label, o.sublabel && _jsxs("span", { className: "ms-option-sub", children: [" \u00B7 ", o.sublabel] })] })] }, o.id));
                            }), filtered.length === 0 && (_jsx("div", { className: "ms-empty", children: "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }))] })] }), document.body)] }));
}
