import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { scriptsApi } from '@/api/scripts';
import { ArrowRight, Minus, Plus, RefreshCw } from 'lucide-react';
function fromSnapshot(s) {
    return (s?.steps || []).map((x) => ({
        id: x.id,
        name: x.name,
        weight: Number(x.weight || 0),
        is_required: !!x.is_required,
        description: x.description || '',
        example_phrases: x.example_phrases || [],
    }));
}
function diff(a, b) {
    const out = [];
    const byNameB = new Map(b.map((s) => [s.name.trim().toLowerCase(), s]));
    const usedB = new Set();
    for (const sa of a) {
        const key = sa.name.trim().toLowerCase();
        const sb = byNameB.get(key);
        if (!sb) {
            out.push({ kind: 'removed', a: sa });
            continue;
        }
        usedB.add(key);
        const fields = [];
        if (Math.abs(sa.weight - sb.weight) > 0.0005)
            fields.push('вес');
        if (sa.is_required !== sb.is_required)
            fields.push('обязательность');
        if ((sa.description || '') !== (sb.description || ''))
            fields.push('описание');
        const ap = (sa.example_phrases || []).join('|');
        const bp = (sb.example_phrases || []).join('|');
        if (ap !== bp)
            fields.push('фразы');
        if (fields.length === 0)
            out.push({ kind: 'same', a: sa, b: sb });
        else
            out.push({ kind: 'changed', a: sa, b: sb, fields });
    }
    for (const sb of b) {
        const key = sb.name.trim().toLowerCase();
        if (!usedB.has(key))
            out.push({ kind: 'added', b: sb });
    }
    return out;
}
export function StructuralDiff({ templateId, versionA, versionB, }) {
    const { data: a, isLoading: la } = useQuery({
        queryKey: ['template-version', templateId, versionA],
        queryFn: () => scriptsApi.getVersion(templateId, versionA),
    });
    const { data: b, isLoading: lb } = useQuery({
        queryKey: ['template-version', templateId, versionB],
        queryFn: () => scriptsApi.getVersion(templateId, versionB),
    });
    if (la || lb) {
        return _jsx("div", { style: { fontSize: 12.5, color: 'var(--text-muted)' }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u0432\u0435\u0440\u0441\u0438\u0439\u2026" });
    }
    if (!a || !b)
        return null;
    const stepsA = fromSnapshot(a.snapshot);
    const stepsB = fromSnapshot(b.snapshot);
    const entries = diff(stepsA, stepsB);
    const added = entries.filter((e) => e.kind === 'added').length;
    const removed = entries.filter((e) => e.kind === 'removed').length;
    const changed = entries.filter((e) => e.kind === 'changed').length;
    return (_jsxs("div", { className: "diff-block", children: [_jsxs("div", { className: "diff-summary", children: [_jsxs("span", { className: "diff-pill diff-pill--add", children: [_jsx(Plus, { size: 11 }), " ", added, " \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E"] }), _jsxs("span", { className: "diff-pill diff-pill--del", children: [_jsx(Minus, { size: 11 }), " ", removed, " \u0443\u0434\u0430\u043B\u0435\u043D\u043E"] }), _jsxs("span", { className: "diff-pill diff-pill--chg", children: [_jsx(RefreshCw, { size: 11 }), " ", changed, " \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043E"] })] }), _jsxs("div", { className: "diff-list", children: [entries.map((e, i) => {
                        if (e.kind === 'same')
                            return null;
                        if (e.kind === 'added') {
                            return (_jsxs("div", { className: "diff-row diff-row--add", children: [_jsx("span", { className: "diff-tag", children: "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u044D\u0442\u0430\u043F" }), _jsxs("div", { className: "diff-step", children: [_jsx("div", { className: "diff-step-name", children: e.b.name }), _jsxs("div", { className: "diff-step-meta", children: [Math.round(e.b.weight * 100), "% \u00B7 ", e.b.is_required ? 'обязательный' : 'опциональный'] })] })] }, i));
                        }
                        if (e.kind === 'removed') {
                            return (_jsxs("div", { className: "diff-row diff-row--del", children: [_jsx("span", { className: "diff-tag", children: "\u0423\u0434\u0430\u043B\u0451\u043D \u044D\u0442\u0430\u043F" }), _jsxs("div", { className: "diff-step", children: [_jsx("div", { className: "diff-step-name", children: e.a.name }), _jsxs("div", { className: "diff-step-meta", children: [Math.round(e.a.weight * 100), "% \u00B7 ", e.a.is_required ? 'обязательный' : 'опциональный'] })] })] }, i));
                        }
                        return (_jsxs("div", { className: "diff-row diff-row--chg", children: [_jsx("span", { className: "diff-tag", children: "\u0418\u0437\u043C\u0435\u043D\u0451\u043D" }), _jsxs("div", { className: "diff-step", children: [_jsx("div", { className: "diff-step-name", children: e.a.name }), _jsxs("div", { className: "diff-step-changes", children: [e.fields.includes('вес') && (_jsxs("span", { className: "diff-change", children: ["\u0432\u0435\u0441: ", Math.round(e.a.weight * 100), "% ", _jsx(ArrowRight, { size: 10 }), " ", Math.round(e.b.weight * 100), "%"] })), e.fields.includes('обязательность') && (_jsxs("span", { className: "diff-change", children: [e.a.is_required ? 'обязательный' : 'опциональный', " ", _jsx(ArrowRight, { size: 10 }), " ", e.b.is_required ? 'обязательный' : 'опциональный'] })), e.fields.includes('описание') && (_jsx("span", { className: "diff-change", children: "\u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043E" })), e.fields.includes('фразы') && (_jsxs("span", { className: "diff-change", children: ["\u044D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0445 \u0444\u0440\u0430\u0437: ", e.a.example_phrases?.length || 0, " ", _jsx(ArrowRight, { size: 10 }), " ", e.b.example_phrases?.length || 0] }))] })] })] }, i));
                    }), added + removed + changed === 0 && (_jsx("div", { className: "diff-empty", children: "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u043D\u043E \u0432\u0435\u0440\u0441\u0438\u0438 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u044B \u2014 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0432 \u044D\u0442\u0430\u043F\u0430\u0445 \u043D\u0435\u0442." }))] })] }));
}
