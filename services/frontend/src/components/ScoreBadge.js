import { jsxs as _jsxs } from "react/jsx-runtime";
export function ScoreBadge({ score }) {
    const tagClass = score >= 80 ? 'tag-success' :
        score >= 60 ? 'tag-warning' :
            'tag-danger';
    return (_jsxs("span", { className: `tag ${tagClass}`, children: [Math.round(score), "%"] }));
}
