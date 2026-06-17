import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Check } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { authApi } from '@/api/auth';
import { recorderApi } from '@/api/recorder';
import { useOrganization, useTerms } from '@/lib/terms';
export function SettingsPage() {
    const [activeTab, setActiveTab] = useState('privacy');
    const terms = useTerms();
    return (_jsxs("div", { className: "card fade-in", children: [_jsx("div", { className: "tabs", children: [
                    { key: 'privacy', label: 'Приватность' },
                    { key: 'notifications', label: 'Уведомления' },
                    { key: 'organization', label: 'Организация' },
                    ...(terms.isTelephony ? [{ key: 'telephony', label: 'Телефония' }] : []),
                ].map((tab) => (_jsx("button", { className: `tab ${activeTab === tab.key ? 'active' : ''}`, onClick: () => setActiveTab(tab.key), children: tab.label }, tab.key))) }), _jsxs("div", { style: { padding: '24px' }, children: [activeTab === 'privacy' && _jsx(PrivacyTab, {}), activeTab === 'notifications' && _jsx(NotificationsTab, {}), activeTab === 'organization' && _jsx(OrganizationTab, {}), activeTab === 'telephony' && terms.isTelephony && _jsx(TelephonyTab, {})] })] }));
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
                                }, children: _jsx(RefreshCw, { size: 14 }) })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, padding: '14px 0', borderTop: '1px solid var(--border)' }, children: [_jsxs("div", { children: [_jsxs("label", { className: "form-label", children: [terms.store, " \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E"] }), _jsxs("select", { className: "form-input", value: settings.default_store_id || '', onChange: (e) => e.target.value && mutation.mutate({ default_store_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D" }), stores.map((s) => _jsx("option", { value: s.id, children: s.name }, s.id))] })] }), _jsxs("div", { children: [_jsxs("label", { className: "form-label", children: [terms.seller, " \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E"] }), _jsxs("select", { className: "form-input", value: settings.default_seller_id || '', onChange: (e) => e.target.value && mutation.mutate({ default_seller_id: e.target.value }), children: [_jsx("option", { value: "", children: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D" }), sellers.map((s) => _jsxs("option", { value: s.id, children: [s.first_name, " ", s.last_name] }, s.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "form-label", children: "\u041A\u0430\u043D\u0430\u043B \u043E\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0430 \u0432 \u0441\u0442\u0435\u0440\u0435\u043E" }), _jsxs("select", { className: "form-input", value: settings.operator_channel, onChange: (e) => mutation.mutate({ operator_channel: Number(e.target.value) }), children: [_jsx("option", { value: 0, children: "\u041B\u0435\u0432\u044B\u0439 (\u043A\u0430\u043D\u0430\u043B 0)" }), _jsx("option", { value: 1, children: "\u041F\u0440\u0430\u0432\u044B\u0439 (\u043A\u0430\u043D\u0430\u043B 1)" })] })] })] }), _jsxs("div", { className: "toggle-desc", children: ["\u0415\u0441\u043B\u0438 \u0410\u0422\u0421 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 ", terms.store.toLowerCase(), "/", terms.seller.toLowerCase(), " \u0432 \u0432\u0435\u0431\u0445\u0443\u043A\u0435 \u2014 \u0437\u0432\u043E\u043D\u043E\u043A \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D \u043A \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F\u043C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E."] }), _jsx(OperatorMappingEditor, { mapping: settings.operator_mapping || {}, sellers: sellers, sellerLabel: terms.seller, onSave: (operator_mapping) => mutation.mutate({ operator_mapping }), isSaving: mutation.isPending }), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
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
    const toggle = (key) => {
        if (!settings)
            return;
        mutation.mutate({
            retention_days: settings.retention_days,
            anonymize_transcripts: settings.anonymize_transcripts,
            [key]: !settings[key],
        });
    };
    if (isLoading) {
        return _jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) });
    }
    if (!settings) {
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0410\u043D\u043E\u043D\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }), _jsx("div", { className: "toggle-desc", children: "\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437 \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u043E\u043A" })] }), _jsx("div", { className: `toggle-switch ${settings.anonymize_transcripts ? 'on' : ''}`, onClick: () => toggle('anonymize_transcripts') })] }), _jsxs("div", { className: "toggle-row", style: { borderTop: '1px solid var(--border)' }, children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0421\u0440\u043E\u043A \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0434\u0430\u043D\u043D\u044B\u0445" }), _jsx("div", { className: "toggle-desc", children: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0434\u0430\u043B\u044F\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u0438 \u0447\u0435\u0440\u0435\u0437 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u0441\u0440\u043E\u043A" })] }), _jsxs("select", { className: "select-pill", value: settings.retention_days, onChange: (e) => mutation.mutate({
                            ...settings,
                            retention_days: Number(e.target.value),
                        }), children: [_jsx("option", { value: 30, children: "30 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 60, children: "60 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 90, children: "90 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 180, children: "180 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 365, children: "1 \u0433\u043E\u0434" })] })] }), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
}
function NotificationsTab() {
    const queryClient = useQueryClient();
    const { data: settings, isLoading } = useQuery({
        queryKey: ['alert-settings'],
        queryFn: () => adminApi.getAlertSettings(),
    });
    const mutation = useMutation({
        mutationFn: (data) => adminApi.updateAlertSettings(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-settings'] }),
    });
    if (isLoading) {
        return _jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) });
    }
    if (!settings) {
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0410\u043B\u0435\u0440\u0442\u044B \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B" }), _jsx("div", { className: "toggle-desc", children: "\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E \u0441\u043E\u0431\u044B\u0442\u0438\u044F\u0445" })] }), _jsx("div", { className: `toggle-switch ${settings.is_active ? 'on' : ''}`, onClick: () => mutation.mutate({ ...settings, is_active: !settings.is_active }) })] }), _jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u041F\u043E\u0440\u043E\u0433 \u043D\u0438\u0437\u043A\u043E\u0439 \u043E\u0446\u0435\u043D\u043A\u0438" }), _jsx("div", { className: "toggle-desc", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u044F\u0442\u044C, \u0435\u0441\u043B\u0438 \u043E\u0446\u0435\u043D\u043A\u0430 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u043D\u0438\u0436\u0435 \u043F\u043E\u0440\u043E\u0433\u0430" })] }), _jsxs("select", { className: "select-pill", value: settings.score_threshold, onChange: (e) => mutation.mutate({ ...settings, score_threshold: Number(e.target.value) }), children: [_jsx("option", { value: 40, children: "40" }), _jsx("option", { value: 50, children: "50" }), _jsx("option", { value: 60, children: "60" }), _jsx("option", { value: 70, children: "70" })] })] }), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
}
