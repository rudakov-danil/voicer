import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Plus } from 'lucide-react';
/** Карта допродаж: кружки-штампы, как на карте лояльности. Закрашенный — гость согласился
 *  на предложение; пустые — сколько осталось до плана смены. Сверх плана — «+N». */
export function StampCard({ filled, total, label, size = 'sm' }) {
    const slots = total && total > 0 ? Math.min(total, 12) : Math.min(filled, 12);
    const extra = Math.max(0, filled - slots);
    if (slots === 0)
        return null;
    return (_jsxs("span", { className: `stamps stamps-${size}${total && filled >= total ? ' is-done' : ''}`, role: "img", "aria-label": label, children: [Array.from({ length: slots }, (_, i) => (
            // Небольшой наклон — как у штампа, поставленного рукой; у каждого кружка свой и постоянный
            _jsx("span", { className: i < filled ? 'stamp is-on' : 'stamp', style: { ['--tilt']: `${((i * 37) % 11) - 5}deg` }, "aria-hidden": "true", children: i < filled && _jsx(Plus, { strokeWidth: 2.5 }) }, i))), extra > 0 && _jsxs("span", { className: "stamp-extra", "aria-hidden": "true", children: ["+", extra] })] }));
}
