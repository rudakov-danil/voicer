import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Check, Trash2, Undo2 } from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/components/ui/Toast';
import { clock } from '@/components/ui/Fingerprint';
import { t, L, locale } from '@/i18n';
/* «Разобрать с продавцом» (ui-concept/conversation.html): разговор попадает в план
   разбора продавца, руководитель оставляет к нему комментарии с моментом записи.
   План виден на странице «Команда» в профиле продавца. */
export function useCoaching(conversationId) {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ['coaching', conversationId],
        queryFn: () => dashboardApi.getCoaching(conversationId),
        enabled: !!conversationId,
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['coaching'] });
    return { items: query.data || [], isLoading: query.isLoading, refresh };
}
/** Кнопка в шапке разговора: добавить в план разбора или убрать из него. */
export function ReviewButton({ conversationId, sellerName }) {
    const { items, refresh } = useCoaching(conversationId);
    const planned = items.find((i) => !i.comment && i.status === 'open');
    const add = useMutation({
        mutationFn: () => dashboardApi.addCoaching(conversationId),
        onSuccess: () => {
            refresh();
            toast(sellerName
                ? L(`Разговор добавлен в план разбора: ${sellerName}`, `Added to the coaching plan: ${sellerName}`)
                : t('Разговор добавлен в план разбора'));
        },
        onError: () => toast(t('Не удалось добавить в план разбора')),
    });
    const remove = useMutation({
        mutationFn: (id) => dashboardApi.deleteCoaching(id),
        onSuccess: () => { refresh(); toast(t('Разговор убран из плана разбора')); },
        onError: () => toast(t('Не удалось убрать из плана разбора')),
    });
    if (planned) {
        return (_jsxs("button", { type: "button", className: "btn", "aria-pressed": "true", disabled: remove.isPending, title: t('Убрать из плана разбора'), onClick: () => remove.mutate(planned.id), children: [_jsx(Check, { size: 15, "aria-hidden": "true" }), t('В плане разбора')] }));
    }
    return (_jsxs("button", { type: "button", className: "btn btn-primary", disabled: add.isPending, onClick: () => add.mutate(), children: [_jsx(ListChecks, { size: 15, "aria-hidden": "true" }), t('Разобрать с продавцом')] }));
}
/** Комментарии руководителя к разговору: список и форма с моментом записи. */
export function CoachingComments({ conversationId, sellerName, now, onSeek }) {
    const { items, refresh } = useCoaching(conversationId);
    const userId = useAuthStore((s) => s.user?.id);
    const role = useAuthStore((s) => s.user?.role);
    const [text, setText] = useState('');
    const [attach, setAttach] = useState(true);
    const comments = items.filter((i) => i.comment);
    const send = useMutation({
        mutationFn: () => dashboardApi.addCoaching(conversationId, {
            comment: text.trim(),
            moment_seconds: attach ? Math.round(now) : null,
        }),
        onSuccess: () => { setText(''); refresh(); toast(t('Комментарий сохранён в плане разбора')); },
        onError: () => toast(t('Не удалось сохранить комментарий')),
    });
    const setStatus = useMutation({
        mutationFn: ({ id, status }) => dashboardApi.setCoachingStatus(id, status),
        onSuccess: refresh,
    });
    const remove = useMutation({
        mutationFn: (id) => dashboardApi.deleteCoaching(id),
        onSuccess: refresh,
    });
    const submit = () => {
        if (!text.trim()) {
            toast(t('Напишите комментарий — пустой не сохраним'));
            return;
        }
        send.mutate();
    };
    return (_jsxs("section", { className: "panel cv-comment", "aria-labelledby": "cv-comment-title", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { id: "cv-comment-title", className: "panel-title", children: t('Комментарий продавцу') }), _jsx("div", { className: "panel-sub", children: sellerName
                                ? L(`${sellerName} · попадёт в план разбора на странице «Команда»`, `${sellerName} · goes to the coaching plan on the Team page`)
                                : t('Попадёт в план разбора продавца на странице «Команда»') })] }) }), _jsxs("div", { className: "panel-body", children: [comments.length > 0 && (_jsx("ul", { className: "cv-comments", children: comments.map((c) => (_jsx(CommentRow, { item: c, canDelete: c.author_id === userId || role === 'director' || role === 'admin', onSeek: onSeek, onToggle: () => setStatus.mutate({ id: c.id, status: c.status === 'done' ? 'open' : 'done' }), onDelete: () => { if (window.confirm(t('Удалить комментарий?')))
                                remove.mutate(c.id); } }, c.id))) })), _jsx("label", { className: "sr-only", htmlFor: "cv-comment-text", children: t('Комментарий') }), _jsx("textarea", { id: "cv-comment-text", className: "cv-comment-text", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                            submit(); }, placeholder: t('Например: «Не обещайте обмен — объясните гарантийный ремонт»…') }), _jsxs("div", { className: "cv-comment-row", children: [_jsxs("label", { className: "cv-check", children: [_jsx("input", { type: "checkbox", checked: attach, onChange: (e) => setAttach(e.target.checked) }), t('Приложить момент'), " ", _jsx("span", { className: "mono", children: clock(now) })] }), _jsx("button", { type: "button", className: "btn btn-primary", onClick: submit, disabled: send.isPending, children: send.isPending ? t('Сохранение…') : t('Сохранить комментарий') })] })] })] }));
}
function CommentRow({ item, canDelete, onSeek, onToggle, onDelete }) {
    const done = item.status === 'done';
    const when = new Date(item.created_at);
    return (_jsxs("li", { className: `cv-comment-item ${done ? 'is-done' : ''}`, children: [_jsxs("div", { className: "cv-comment-meta", children: [_jsx("span", { translate: "no", children: item.author_name || '—' }), _jsx("span", { "aria-hidden": "true", children: "\u00B7" }), _jsxs("span", { children: [when.toLocaleDateString(locale, { day: 'numeric', month: 'short' }), ", ", when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })] }), item.moment_seconds != null && (_jsxs("button", { type: "button", className: "cv-step-go", onClick: () => onSeek(item.moment_seconds), children: ["\u25B6 ", clock(item.moment_seconds)] })), done && _jsx("span", { className: "tag tag-success", children: t('Разобрано') })] }), _jsx("p", { className: "cv-comment-body", translate: "no", children: item.comment }), _jsxs("div", { className: "cv-comment-tools", children: [_jsx("button", { type: "button", className: "btn btn-sm btn-ghost", onClick: onToggle, children: done ? _jsxs(_Fragment, { children: [_jsx(Undo2, { size: 13, "aria-hidden": "true" }), t('Вернуть в план')] }) : _jsxs(_Fragment, { children: [_jsx(Check, { size: 13, "aria-hidden": "true" }), t('Разобрано')] }) }), canDelete && (_jsx("button", { type: "button", className: "btn btn-sm btn-ghost cv-danger", onClick: onDelete, "aria-label": t('Удалить комментарий'), children: _jsx(Trash2, { size: 13, "aria-hidden": "true" }) }))] })] }));
}
