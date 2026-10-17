import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
/* Подзаголовок и кнопки страницы в общей шапке (Topbar), как в концепте:
   «Скрипты · 4 скрипта · …» слева и действия справа от заголовка. */
export const PAGE_SUBTITLE_SLOT = 'page-subtitle-slot';
export const PAGE_ACTIONS_SLOT = 'page-actions-slot';
function useSlot(id) {
    const [el, setEl] = useState(null);
    useEffect(() => { setEl(document.getElementById(id)); }, [id]);
    return el;
}
export function PageSubtitle({ children }) {
    const el = useSlot(PAGE_SUBTITLE_SLOT);
    return el ? createPortal(children, el) : null;
}
export function PageActions({ children }) {
    const el = useSlot(PAGE_ACTIONS_SLOT);
    return el ? createPortal(children, el) : null;
}
