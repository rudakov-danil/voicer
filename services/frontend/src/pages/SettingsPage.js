import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Check } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { authApi } from '@/api/auth';
import { recorderApi } from '@/api/recorder';
import { TELEPHONY_ENABLED, useOrganization, useTerms } from '@/lib/terms';
import { initials } from '@/lib/format';
import { t, L, isEn, setLang, plural } from '@/i18n';
/* «Настройки» по концепту (ui-concept/settings.html): одна страница с разделами
   и навигацией слева. Док-станций и интеграций нет — эти разделы концепта не переносим. */
const SECTIONS = [
    { id: 'org', label: 'Организация' },
    { id: 'stores', label: 'Магазины' },
    { id: 'users', label: 'Пользователи и роли' },
    { id: 'alerts', label: 'Оповещения' },
    { id: 'privacy', label: 'Приватность и хранение' },
];
const ROLE_LABELS = { director: 'Директор', admin: 'Администратор', rop: 'РОП', manager: 'Менеджер магазина' };
const ROLE_NOTES = [
    ['Директор', 'Видит всю сеть и все разделы.'],
    ['Администратор', 'Пользователи, магазины, продавцы и настройки.'],
    ['РОП', 'Аналитика и разборы по назначенным магазинам.'],
    ['Менеджер магазина', 'Свой магазин: разговоры, продавцы и скрипты.'],
];
export function SettingsPage() {
    const terms = useTerms();
    const [current, setCurrent] = useState('org');
    const go = (id) => {
        setCurrent(id);
        document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const sections = [
        ...SECTIONS,
        ...(terms.isTelephony ? [{ id: 'telephony', label: 'Телефония' }] : []),
    ];
    return (_jsxs("div", { className: "set-grid", children: [_jsx("nav", { className: "set-nav", "aria-label": t('Разделы настроек'), children: sections.map((s) => (_jsx("button", { type: "button", "aria-current": current === s.id ? 'true' : undefined, onClick: () => go(s.id), children: t(s.label) }, s.id))) }), _jsxs("div", { className: "set-body", children: [_jsx(OrgSection, {}), _jsx(StoresSection, {}), _jsx(UsersSection, {}), _jsxs("section", { id: "set-alerts", className: "panel set-sec", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Оповещения') }), _jsx("div", { className: "panel-sub", children: t('Когда разговор попадает в очередь на разбор и в уведомления') })] }) }), _jsx("div", { className: "panel-body", children: _jsx(NotificationsTab, {}) })] }), _jsxs("section", { id: "set-privacy", className: "panel set-sec", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Приватность и хранение') }), _jsx("div", { className: "panel-sub", children: t('Запись разговоров в магазинах по 152-ФЗ') })] }) }), _jsx("div", { className: "panel-body", children: _jsx(PrivacyTab, {}) })] }), TELEPHONY_ENABLED && (_jsxs("section", { className: "panel set-sec", children: [_jsx("div", { className: "panel-head", children: _jsx("h2", { className: "panel-title", children: t('Тип продаж') }) }), _jsx("div", { className: "panel-body", children: _jsx(OrganizationTab, {}) })] })), terms.isTelephony && (_jsxs("section", { id: "set-telephony", className: "panel set-sec", children: [_jsx("div", { className: "panel-head", children: _jsx("h2", { className: "panel-title", children: t('Телефония') }) }), _jsx("div", { className: "panel-body", children: _jsx(TelephonyTab, {}) })] }))] })] }));
}
function SetRow({ title, desc, children }) {
    return (_jsxs("div", { className: "set-row", children: [_jsxs("div", { children: [_jsx("div", { className: "set-row-title", children: t(title) }), desc && _jsx("div", { className: "set-row-desc", children: t(desc) })] }), _jsx("div", { className: "set-row-ctl", children: children })] }));
}
function OrgSection() {
    const { data: org } = useOrganization();
    return (_jsxs("section", { id: "set-org", className: "panel set-sec", children: [_jsx("div", { className: "panel-head", children: _jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Организация') }), _jsx("div", { className: "panel-sub", children: t('Общие данные и вид интерфейса') })] }) }), _jsxs("div", { className: "panel-body", children: [_jsx(SetRow, { title: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", desc: "\u0412\u0438\u0434\u043D\u043E \u0432 \u043E\u0442\u0447\u0451\u0442\u0430\u0445 \u0438 \u043F\u0438\u0441\u044C\u043C\u0430\u0445", children: _jsx("b", { translate: "no", children: org?.name || '—' }) }), _jsx(SetRow, { title: "\u0427\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u044F\u0441", desc: "\u0414\u043B\u044F \u0433\u0440\u0430\u0444\u0438\u043A\u043E\u0432 \u043F\u043E \u0447\u0430\u0441\u0430\u043C \u0438 \u0434\u043D\u044F\u043C", children: _jsx("span", { children: t('Москва, UTC+3') }) }), _jsx(SetRow, { title: "\u042F\u0437\u044B\u043A \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430", desc: "\u041C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0441\u0440\u0430\u0437\u0443 \u0434\u043B\u044F \u0432\u0430\u0448\u0435\u0439 \u0443\u0447\u0451\u0442\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438", children: _jsxs("div", { className: "seg", role: "group", "aria-label": t('Язык интерфейса'), children: [_jsx("button", { type: "button", "aria-pressed": !isEn, onClick: () => isEn && setLang('ru'), translate: "no", children: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" }), _jsx("button", { type: "button", "aria-pressed": isEn, onClick: () => !isEn && setLang('en'), translate: "no", children: "English" })] }) })] })] }));
}
function StoresSection() {
    const { data } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const stores = data?.items || [];
    return (_jsxs("section", { id: "set-stores", className: "panel set-sec", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Магазины') }), _jsx("div", { className: "panel-sub", children: L(`${stores.length} ${plural(stores.length, ['магазин', 'магазина', 'магазинов'], ['', ''])} в сети`, `${stores.length} stores in the network`) })] }), _jsx(Link, { className: "btn btn-sm", to: "/admin", children: t('Добавить магазин') })] }), _jsx("div", { className: "panel-body", style: { paddingTop: 6 }, children: _jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('Магазин') }), _jsx("th", { scope: "col", children: t('Адрес') }), _jsx("th", { scope: "col", className: "t-right", children: t('Продавцов') })] }) }), _jsx("tbody", { children: stores.map((s) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("b", { translate: "no", children: s.name }), !s.is_active && _jsxs("span", { className: "muted", children: [" \u00B7 ", t('отключён')] })] }), _jsx("td", { translate: "no", children: s.address || '—' }), _jsx("td", { className: "t-right t-num", children: s.seller_count ?? 0 })] }, s.id))) })] }) }) })] }));
}
function UsersSection() {
    const { data } = useQuery({ queryKey: ['admin-users'], queryFn: () => adminApi.getUsers() });
    const { data: stores } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const storeName = new Map((stores?.items || []).map((s) => [s.id, s.name]));
    const users = data?.items || [];
    return (_jsxs("section", { id: "set-users", className: "panel set-sec", children: [_jsxs("div", { className: "panel-head", children: [_jsxs("div", { children: [_jsx("h2", { className: "panel-title", children: t('Пользователи и роли') }), _jsx("div", { className: "panel-sub", children: t('Кто работает с аналитикой · продавцы добавляются в разделе «Администрирование»') })] }), _jsx(Link, { className: "btn btn-sm", to: "/admin", children: t('Пригласить') })] }), _jsxs("div", { className: "panel-body", style: { paddingTop: 6 }, children: [_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: t('Пользователь') }), _jsx("th", { scope: "col", children: t('Роль') }), _jsx("th", { scope: "col", children: t('Доступ') })] }) }), _jsx("tbody", { children: users.map((u) => {
                                        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
                                        return (_jsxs("tr", { className: u.is_active ? '' : 'is-off', children: [_jsx("td", { children: _jsxs("span", { className: "person", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(name) }), _jsxs("span", { children: [_jsx("span", { className: "person-name", translate: "no", children: name }), _jsx("span", { className: "person-sub", translate: "no", children: u.email })] })] }) }), _jsx("td", { children: t(ROLE_LABELS[u.role] || u.role) }), _jsx("td", { children: u.store_id ? _jsx("span", { translate: "no", children: storeName.get(u.store_id) || '—' }) : t('Вся сеть') })] }, u.id));
                                    }) })] }) }), _jsx("div", { className: "set-roles", children: ROLE_NOTES.map(([role, note]) => _jsxs("div", { children: [_jsx("b", { children: t(role) }), _jsx("span", { children: t(note) })] }, role)) })] })] }));
}
function OrganizationTab() {
    const queryClient = useQueryClient();
    const { data: org, isLoading } = useOrganization();
    const mutation = useMutation({
        mutationFn: (org_type) => authApi.updateOrganization({ org_type }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization'] }),
    });
    if (isLoading) {
        return _jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) });
    }
    if (!org) {
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438" });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0422\u0438\u043F \u043F\u0440\u043E\u0434\u0430\u0436" }), _jsx("div", { className: "toggle-desc", children: "\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442 \u0442\u0435\u0440\u043C\u0438\u043D\u043E\u043B\u043E\u0433\u0438\u044E \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430 \u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0444\u0443\u043D\u043A\u0446\u0438\u0438. \u00AB\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u0438\u044F\u00BB \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u0437\u0432\u043E\u043D\u043A\u043E\u0432, \u0432\u0435\u0431\u0445\u0443\u043A \u0410\u0422\u0421, \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0438 \u0438\u0441\u0445\u043E\u0434\u044B \u0437\u0432\u043E\u043D\u043A\u043E\u0432." })] }), _jsxs("select", { className: "select-pill", value: org.org_type, onChange: (e) => mutation.mutate(e.target.value), children: [_jsx("option", { value: "retail", children: "\u041E\u0444\u043B\u0430\u0439\u043D-\u043F\u0440\u043E\u0434\u0430\u0436\u0438 (\u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B)" }), _jsx("option", { value: "telephony", children: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D\u0438\u044F (\u0437\u0432\u043E\u043D\u043A\u0438)" })] })] }), mutation.isError && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 8 }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u2014 \u043D\u0443\u0436\u043D\u044B \u043F\u0440\u0430\u0432\u0430 \u0434\u0438\u0440\u0435\u043A\u0442\u043E\u0440\u0430 \u0438\u043B\u0438 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430" })), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
}
function TelephonyTab() {
    const queryClient = useQueryClient();
    const terms = useTerms();
    const [copied, setCopied] = useState(false);
    const { data: settings, isLoading, isError } = useQuery({
        queryKey: ['telephony-settings'],
        queryFn: () => recorderApi.getTelephonySettings(),
        retry: 1,
    });
    const { data: storesData } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.getStores() });
    const { data: sellersData } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.getSellers() });
    const mutation = useMutation({
        mutationFn: (data) => recorderApi.updateTelephonySettings(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telephony-settings'] }),
    });
    if (isLoading) {
        return _jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) });
    }
    if (isError || !settings) {
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0438\u0438 (\u043D\u0443\u0436\u043D\u044B \u043F\u0440\u0430\u0432\u0430 \u0434\u0438\u0440\u0435\u043A\u0442\u043E\u0440\u0430 \u0438\u043B\u0438 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430)" });
    }
    const webhookUrl = `${window.location.origin}${settings.webhook_url_path}`;
    const stores = storesData?.items ?? [];
    const sellers = sellersData?.items ?? [];
    const copyUrl = () => {
        navigator.clipboard.writeText(webhookUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u041F\u0440\u0438\u0451\u043C \u0437\u0432\u043E\u043D\u043A\u043E\u0432 \u0438\u0437 \u0410\u0422\u0421" }), _jsx("div", { className: "toggle-desc", children: "\u0412\u0435\u0431\u0445\u0443\u043A \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0437\u0432\u043E\u043D\u043A\u043E\u0432 \u0438\u0437 \u0432\u0430\u0448\u0435\u0439 \u0410\u0422\u0421" })] }), _jsx("div", { className: `toggle-switch ${settings.is_enabled ? 'on' : ''}`, onClick: () => mutation.mutate({ is_enabled: !settings.is_enabled }) })] }), _jsxs("div", { style: { padding: '14px 0', borderTop: '1px solid var(--border)' }, children: [_jsx("div", { className: "toggle-title", style: { marginBottom: 6 }, children: "URL \u0432\u0435\u0431\u0445\u0443\u043A\u0430" }), _jsx("div", { className: "toggle-desc", style: { marginBottom: 10 }, children: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u0432\u0430\u0448\u0443 \u0410\u0422\u0421 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C POST-\u0437\u0430\u043F\u0440\u043E\u0441 \u0441 JSON \u043D\u0430 \u044D\u0442\u043E\u0442 \u0430\u0434\u0440\u0435\u0441 \u043F\u043E\u0441\u043B\u0435 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0437\u0432\u043E\u043D\u043A\u0430. \u041F\u043E\u043B\u044F: recording_url (\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E), direction, client_phone, operator_phone, external_call_id, started_at." }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("code", { style: {
                                    flex: 1, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)',
                                    fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }, children: webhookUrl }), _jsx("button", { className: "btn btn-sm btn-outline", onClick: copyUrl, title: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C URL", children: copied ? _jsx(Check, { size: 14 }) : _jsx(Copy, { size: 14 }) }), _jsx("button", { className: "btn btn-sm btn-outline", title: "\u041F\u0435\u0440\u0435\u0432\u044B\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0442\u043E\u043A\u0435\u043D \u2014 \u0441\u0442\u0430\u0440\u044B\u0439 URL \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u043D\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", onClick: () => {
                                    if (confirm('Перевыпустить токен вебхука? Старый URL перестанет работать.')) {
                                        mutation.mutate({ regenerate_token: true });
                                    }
                                }, children: _jsx(RefreshCw, { size: 14 }) })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, padding: '14px 0', borderTop: '1px solid var(--border)' }, children: [_jsxs("div", { children: [_jsxs("label", { className: "form-label", children: [terms.store, " \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E"] }), _jsxs("select", { className: "form-input", value: settings.default_store_id || '', onChange: (e) => e.target.value && mutation.mutate({ default_store_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] })] }), _jsxs("div", { children: [_jsxs("label", { className: "form-label", children: [terms.seller, " \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E"] }), _jsxs("select", { className: "form-input", value: settings.default_seller_id || '', onChange: (e) => e.target.value && mutation.mutate({ default_seller_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D" }), sellers.map((s) => _jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u041A\u0430\u043D\u0430\u043B \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0430 \u0432 \u0441\u0442\u0435\u0440\u0435\u043E" }), _jsxs("select", { className: "form-input", value: settings.operator_channel, onChange: (e) => mutation.mutate({ operator_channel: Number(e.target.value) }), children: [_jsx("option", { value: 0, children: "\u041B\u0435\u0432\u044B\u0439 (\u043A\u0430\u043D\u0430\u043B 0)" }), _jsx("option", { value: 1, children: "\u041F\u0440\u0430\u0432\u044B\u0439 (\u043A\u0430\u043D\u0430\u043B 1)" })] })] })] }), _jsxs("div", { className: "toggle-desc", children: ["\u0415\u0441\u043B\u0438 \u0410\u0422\u0421 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 ", terms.store.toLowerCase(), "/", terms.seller.toLowerCase(), " \u0432 \u0432\u0435\u0431\u0445\u0443\u043A\u0435 \u2014 \u0437\u0432\u043E\u043D\u043E\u043A \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D \u043A \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F\u043C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."] }), _jsx(OperatorMappingEditor, { mapping: settings.operator_mapping || {}, sellers: sellers, sellerLabel: terms.seller, onSave: (operator_mapping) => mutation.mutate({ operator_mapping }), isSaving: mutation.isPending }), _jsx(ScorableCategoriesEditor, { value: settings.scorable_categories, onSave: (scorable_categories) => mutation.mutate({ scorable_categories }), isSaving: mutation.isPending }), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
}
/** Какие категории звонков идут в рейтинг менеджера (оцениваются по скрипту).
 *  Нецелевые/сервисные звонки, исключённые здесь, не портят средний балл сотрудника. */
const SCORABLE_CATEGORY_OPTIONS = [
    { code: 'sales', label: 'Продажные', hint: 'Есть намерение или потенциал покупки' },
    { code: 'service', label: 'Сервисные', hint: 'Обслуживание текущего клиента: статус заказа, поддержка' },
    { code: 'non_target', label: 'Нецелевые', hint: 'Ошиблись номером, спам, поставщик, вакансии' },
    { code: 'other', label: 'Прочие', hint: 'Не удалось однозначно классифицировать' },
];
function ScorableCategoriesEditor({ value, onSave, isSaving }) {
    // null → дефолт: оцениваются только продажные звонки
    const current = value && value.length ? value : ['sales'];
    const toggle = (code) => {
        const next = current.includes(code)
            ? current.filter(c => c !== code)
            : [...current, code];
        // Не даём выключить всё — иначе оценивать будет нечего; оставляем хотя бы 'sales'
        onSave(next.length ? next : ['sales']);
    };
    return (_jsxs("div", { style: { marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }, children: [_jsx("label", { className: "form-label", children: "\u041A\u0430\u043A\u0438\u0435 \u0437\u0432\u043E\u043D\u043A\u0438 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u0442\u044C \u0432 \u0440\u0435\u0439\u0442\u0438\u043D\u0433\u0435" }), _jsx("div", { className: "toggle-desc", style: { marginBottom: 12 }, children: "\u0418\u0418 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044E \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0437\u0432\u043E\u043D\u043A\u0430. \u0417\u0432\u043E\u043D\u043A\u0438 \u0432\u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439 \u043D\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u043F\u043E \u0441\u043A\u0440\u0438\u043F\u0442\u0443 \u0438 \u043D\u0435 \u0432\u043B\u0438\u044F\u044E\u0442 \u043D\u0430 \u0441\u0440\u0435\u0434\u043D\u0438\u0439 \u0431\u0430\u043B\u043B \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0430 \u2014 \u0442\u0430\u043A \u043D\u0435\u0446\u0435\u043B\u0435\u0432\u044B\u0435 \u0438 \u0441\u0435\u0440\u0432\u0438\u0441\u043D\u044B\u0435 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u043E\u0440\u0442\u044F\u0442 \u0440\u0435\u0439\u0442\u0438\u043D\u0433." }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: SCORABLE_CATEGORY_OPTIONS.map(opt => {
                    const checked = current.includes(opt.code);
                    return (_jsxs("label", { style: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isSaving ? 'default' : 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: checked, disabled: isSaving, onChange: () => toggle(opt.code), style: { marginTop: 3 } }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 13.5, color: 'var(--text)' }, children: opt.label }), _jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: opt.hint })] })] }, opt.code));
                }) })] }));
}
/** Сопоставление номеров (добавочных) операторов из АТС с сотрудниками системы.
 *  По нему вебхук привязывает звонок к конкретному человеку — в аналитике видно ФИО. */
function OperatorMappingEditor({ mapping, sellers, sellerLabel, onSave, isSaving }) {
    const toRows = (m) => Object.entries(m).map(([phone, sellerId], i) => ({ key: `r-${i}-${phone}`, phone, sellerId }));
    const [rows, setRows] = useState(() => toRows(mapping));
    const [dirty, setDirty] = useState(false);
    // Синхронизация с сервером, пока пользователь не начал править
    useEffect(() => {
        if (!dirty)
            setRows(toRows(mapping));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(mapping)]);
    const update = (key, patch) => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        setDirty(true);
    };
    const remove = (key) => {
        setRows((prev) => prev.filter((r) => r.key !== key));
        setDirty(true);
    };
    const addRow = () => {
        setRows((prev) => [...prev, { key: `n-${Date.now()}`, phone: '', sellerId: '' }]);
        setDirty(true);
    };
    const sellerName = (id) => {
        const s = sellers.find((x) => x.id === id);
        return s ? `${s.first_name} ${s.last_name}` : id;
    };
    const validRows = rows.filter((r) => r.phone.trim() && r.sellerId);
    const phones = validRows.map((r) => r.phone.trim());
    const hasDuplicates = new Set(phones).size !== phones.length;
    const canSave = dirty && !hasDuplicates && rows.every((r) => (!r.phone.trim() && !r.sellerId) || (r.phone.trim() && r.sellerId));
    const save = () => {
        const m = {};
        for (const r of validRows)
            m[r.phone.trim()] = r.sellerId;
        onSave(m);
        setDirty(false);
    };
    return (_jsxs("div", { style: { padding: '14px 0', borderTop: '1px solid var(--border)', marginTop: 14 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsx("div", { className: "toggle-title", children: "\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u043E\u043C\u0435\u0440\u043E\u0432 \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u043E\u0432" }), _jsx("button", { className: "btn btn-sm btn-outline", onClick: addRow, children: "+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] }), _jsx("div", { className: "toggle-desc", style: { marginBottom: 12 }, children: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435, \u043A\u0430\u043A\u043E\u0439 \u0434\u043E\u0431\u0430\u0432\u043E\u0447\u043D\u044B\u0439/\u043D\u043E\u043C\u0435\u0440 \u0438\u0437 \u0410\u0422\u0421 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0438\u0442 \u043A\u0430\u043A\u043E\u043C\u0443 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0443 \u2014 \u0437\u0432\u043E\u043D\u043A\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u0438\u0432\u044F\u0437\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u043A \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u043C\u0443 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443, \u0438 \u0432 \u0430\u043D\u0430\u043B\u0438\u0442\u0438\u043A\u0435 \u0432\u044B \u0443\u0432\u0438\u0434\u0438\u0442\u0435 \u0424\u0418\u041E, \u0430 \u043D\u0435 \u043D\u043E\u043C\u0435\u0440. \u041D\u043E\u043C\u0435\u0440 \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0442\u044C \u0441 \u0442\u0435\u043C, \u0447\u0442\u043E \u0410\u0422\u0421 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 \u0432 \u043F\u043E\u043B\u0435 operator_phone \u0432\u0435\u0431\u0445\u0443\u043A\u0430." }), rows.length === 0 && (_jsxs("div", { style: { fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }, children: ["\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u2014 \u0437\u0432\u043E\u043D\u043A\u0438 \u0431\u0435\u0437 \u044F\u0432\u043D\u043E\u0433\u043E \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0430 \u043F\u043E\u043F\u0430\u0434\u0443\u0442 \u043D\u0430 ", sellerLabel.toLowerCase(), "\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."] })), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: rows.map((r) => {
                    const isDup = r.phone.trim() && phones.filter((p) => p === r.phone.trim()).length > 1;
                    return (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '180px 1fr 32px', gap: 8, alignItems: 'center' }, children: [_jsx("input", { className: "form-input", placeholder: "101 \u0438\u043B\u0438 +7900...", value: r.phone, onChange: (e) => update(r.key, { phone: e.target.value }), style: isDup ? { borderColor: 'var(--danger)' } : undefined, title: isDup ? 'Этот номер указан несколько раз' : undefined }), _jsxs("select", { className: "form-input", value: r.sellerId, onChange: (e) => update(r.key, { sellerId: e.target.value }), children: [_jsx("option", { value: "", children: "\u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430 \u2014" }), sellers.map((s) => (_jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id))), r.sellerId && !sellers.some((s) => s.id === r.sellerId) && (_jsxs("option", { value: r.sellerId, children: [sellerName(r.sellerId), " (\u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D)"] }))] }), _jsx("button", { className: "btn-icon", onClick: () => remove(r.key), title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", style: { color: 'var(--danger)' }, children: "\u2715" })] }, r.key));
                }) }), hasDuplicates && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 8 }, children: "\u041E\u0434\u0438\u043D \u0438 \u0442\u043E\u0442 \u0436\u0435 \u043D\u043E\u043C\u0435\u0440 \u0443\u043A\u0430\u0437\u0430\u043D \u0434\u043B\u044F \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432 \u2014 \u0443\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442." })), dirty && (_jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }, children: [_jsx("button", { className: "btn btn-primary btn-sm", onClick: save, disabled: !canSave || isSaving, children: isSaving ? 'Сохранение…' : 'Сохранить сопоставление' }), _jsx("button", { className: "btn btn-sm btn-outline", onClick: () => { setRows(toRows(mapping)); setDirty(false); }, children: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C" }), !canSave && !hasDuplicates && (_jsx("span", { style: { fontSize: 12, color: 'var(--text-muted)' }, children: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u0438 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430 \u0432 \u043A\u0430\u0436\u0434\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u0435" }))] }))] }));
}
function Switch({ on, onChange, label }) {
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": on, "aria-label": label, className: "cv-switch", onClick: onChange, children: _jsx("span", { className: "cv-switch-track", "aria-hidden": "true" }) }));
}
function PrivacyTab() {
    const queryClient = useQueryClient();
    const { data: settings, isLoading } = useQuery({
        queryKey: ['privacy-settings'],
        queryFn: () => adminApi.getPrivacySettings(),
    });
    const mutation = useMutation({
        mutationFn: (data) => adminApi.updatePrivacySettings(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['privacy-settings'] }),
    });
    if (isLoading)
        return _jsx("div", { className: "muted", children: t('Загрузка...') });
    if (!settings)
        return _jsx("div", { className: "muted", children: t('Не удалось загрузить настройки') });
    const save = (patch) => mutation.mutate({
        retention_days: settings.retention_days,
        anonymize_transcripts: settings.anonymize_transcripts,
        consent_required: settings.consent_required,
        ...patch,
    });
    return (_jsxs(_Fragment, { children: [_jsx(SetRow, { title: "\u0421\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u043D\u043E\u043C\u0435\u0440\u0430 \u043A\u0430\u0440\u0442, \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u043E\u0432 \u0438 \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u043E\u0432", desc: "\u0418\u0418 \u0443\u0431\u0438\u0440\u0430\u0435\u0442 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437 \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u043E\u043A \u043F\u0440\u0438 \u0430\u043D\u0430\u043B\u0438\u0437\u0435", children: _jsx(Switch, { on: !!settings.anonymize_transcripts, label: t('Скрывать персональные данные'), onChange: () => save({ anonymize_transcripts: !settings.anonymize_transcripts }) }) }), _jsx(SetRow, { title: "\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432 \u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u044C", desc: "\u041E\u0442\u043C\u0435\u0442\u043A\u0430 \u043E \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0438 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430 \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438", children: _jsx(Switch, { on: !!settings.consent_required, label: t('Требовать согласие на запись'), onChange: () => save({ consent_required: !settings.consent_required }) }) }), _jsx(SetRow, { title: "\u0425\u0440\u0430\u043D\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u0438 \u0438 \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u043A\u0438", desc: "\u0421\u0440\u043E\u043A \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u043E\u0432", children: _jsx("div", { className: "seg", role: "group", "aria-label": t('Срок хранения'), children: [[30, '30 дней'], [90, '90 дней'], [180, '180 дней'], [365, '1 год']].map(([d, label]) => (_jsx("button", { type: "button", "aria-pressed": settings.retention_days === d, onClick: () => save({ retention_days: d }), children: t(label) }, d))) }) }), mutation.isPending && _jsx("div", { className: "set-saving", children: t('Сохранение...') }), mutation.isError && _jsx("div", { className: "set-error", children: t('Не удалось сохранить — нужны права директора или администратора') })] }));
}
function NotificationsTab() {
    const queryClient = useQueryClient();
    const { data: settings, isLoading } = useQuery({
        queryKey: ['alert-settings'],
        queryFn: () => adminApi.getAlertSettings(),
    });
    const [threshold, setThreshold] = useState('');
    const [emails, setEmails] = useState('');
    useEffect(() => {
        if (!settings)
            return;
        setThreshold(String(settings.score_threshold ?? ''));
        setEmails((settings.email_recipients || []).join(', '));
    }, [settings]);
    const mutation = useMutation({
        mutationFn: (data) => adminApi.updateAlertSettings(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-settings'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
    if (isLoading)
        return _jsx("div", { className: "muted", children: t('Загрузка...') });
    if (!settings)
        return _jsx("div", { className: "muted", children: t('Не удалось загрузить настройки') });
    const save = (patch) => mutation.mutate({
        score_threshold: settings.score_threshold,
        no_activity_hours: settings.no_activity_hours,
        email_recipients: settings.email_recipients || [],
        is_active: settings.is_active,
        ...patch,
    });
    const saveThreshold = () => {
        const v = Math.round(Number(threshold));
        if (Number.isFinite(v) && v >= 0 && v <= 100 && v !== settings.score_threshold)
            save({ score_threshold: v });
        else
            setThreshold(String(settings.score_threshold));
    };
    const saveEmails = () => {
        const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
        if (list.join(',') !== (settings.email_recipients || []).join(','))
            save({ email_recipients: list });
    };
    return (_jsxs(_Fragment, { children: [_jsx(SetRow, { title: "\u041E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B", desc: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430\u0445, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F", children: _jsx(Switch, { on: !!settings.is_active, label: t('Оповещения включены'), onChange: () => save({ is_active: !settings.is_active }) }) }), _jsx(SetRow, { title: "\u0411\u0430\u043B\u043B \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u043D\u0438\u0436\u0435", desc: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u043F\u043E\u043F\u0430\u0434\u0451\u0442 \u0432 \u00AB\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F\u00BB \u0438 \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u043D\u0430 \u0440\u0430\u0437\u0431\u043E\u0440", children: _jsx("input", { className: "set-num", type: "number", min: 0, max: 100, value: threshold, "aria-label": t('Порог балла'), onChange: (e) => setThreshold(e.target.value), onBlur: saveThreshold, onKeyDown: (e) => { if (e.key === 'Enter')
                        saveThreshold(); } }) }), _jsx(SetRow, { title: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435 \u043F\u0440\u0430\u0432\u0438\u043B \u043E\u0431\u0449\u0435\u043D\u0438\u044F", desc: "\u0420\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0441 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435\u043C \u0432\u0441\u0435\u0433\u0434\u0430 \u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u043D\u0430 \u0440\u0430\u0437\u0431\u043E\u0440", children: _jsx("span", { className: "flag is-good", children: t('Всегда') }) }), _jsx(SetRow, { title: "\u041F\u0438\u0441\u044C\u043C\u0430 \u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u0430", desc: "\u0427\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E. \u041F\u0443\u0441\u0442\u043E \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0435", children: _jsx("input", { className: "set-text", type: "text", value: emails, placeholder: "director@shop.ru", "aria-label": t('Адреса для писем'), onChange: (e) => setEmails(e.target.value), onBlur: saveEmails, onKeyDown: (e) => { if (e.key === 'Enter')
                        saveEmails(); } }) }), mutation.isPending && _jsx("div", { className: "set-saving", children: t('Сохранение...') }), mutation.isError && _jsx("div", { className: "set-error", children: t('Не удалось сохранить — нужны права директора или администратора') })] }));
}
