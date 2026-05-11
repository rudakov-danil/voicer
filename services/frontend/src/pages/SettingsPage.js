import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
export function SettingsPage() {
    const [activeTab, setActiveTab] = useState('privacy');
    return (_jsxs("div", { className: "card fade-in", children: [_jsx("div", { className: "tabs", children: [
                    { key: 'privacy', label: 'Приватность' },
                    { key: 'notifications', label: 'Уведомления' },
                    { key: 'integrations', label: 'Интеграции' },
                ].map((tab) => (_jsx("button", { className: `tab ${activeTab === tab.key ? 'active' : ''}`, onClick: () => setActiveTab(tab.key), children: tab.label }, tab.key))) }), _jsxs("div", { style: { padding: '24px' }, children: [activeTab === 'privacy' && _jsx(PrivacyTab, {}), activeTab === 'notifications' && _jsx(NotificationsTab, {}), activeTab === 'integrations' && _jsx(IntegrationsTab, {})] })] }));
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
            consent_required: settings.consent_required,
            [key]: !settings[key],
        });
    };
    if (isLoading) {
        return _jsx("div", { style: { display: 'flex', justifyContent: 'center', padding: '40px 0' }, children: _jsx("div", { className: "spinner" }) });
    }
    if (!settings) {
        return _jsx("div", { style: { padding: '20px', color: 'var(--text-muted)' }, children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0410\u043D\u043E\u043D\u0438\u043C\u0438\u0437\u0430\u0446\u0438\u044F \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432" }), _jsx("div", { className: "toggle-desc", children: "\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437 \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u043E\u043A" })] }), _jsx("div", { className: `toggle-switch ${settings.anonymize_transcripts ? 'on' : ''}`, onClick: () => toggle('anonymize_transcripts') })] }), _jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0421\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u044C" }), _jsx("div", { className: "toggle-desc", children: "\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434 \u043D\u0430\u0447\u0430\u043B\u043E\u043C \u0437\u0430\u043F\u0438\u0441\u0438" })] }), _jsx("div", { className: `toggle-switch ${settings.consent_required ? 'on' : ''}`, onClick: () => toggle('consent_required') })] }), _jsxs("div", { className: "toggle-row", style: { borderTop: '1px solid var(--border)' }, children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0421\u0440\u043E\u043A \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0434\u0430\u043D\u043D\u044B\u0445" }), _jsx("div", { className: "toggle-desc", children: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0434\u0430\u043B\u044F\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u0438 \u0447\u0435\u0440\u0435\u0437 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u0441\u0440\u043E\u043A" })] }), _jsxs("select", { value: settings.retention_days, onChange: (e) => mutation.mutate({
                            ...settings,
                            retention_days: Number(e.target.value),
                        }), style: {
                            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
                        }, children: [_jsx("option", { value: 30, children: "30 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 60, children: "60 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 90, children: "90 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 180, children: "180 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: 365, children: "1 \u0433\u043E\u0434" })] })] }), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
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
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u0410\u043B\u0435\u0440\u0442\u044B \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B" }), _jsx("div", { className: "toggle-desc", children: "\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E \u0441\u043E\u0431\u044B\u0442\u0438\u044F\u0445" })] }), _jsx("div", { className: `toggle-switch ${settings.is_active ? 'on' : ''}`, onClick: () => mutation.mutate({ ...settings, is_active: !settings.is_active }) })] }), _jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u041F\u043E\u0440\u043E\u0433 \u043D\u0438\u0437\u043A\u043E\u0439 \u043E\u0446\u0435\u043D\u043A\u0438" }), _jsx("div", { className: "toggle-desc", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u044F\u0442\u044C, \u0435\u0441\u043B\u0438 \u043E\u0446\u0435\u043D\u043A\u0430 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u043D\u0438\u0436\u0435 \u043F\u043E\u0440\u043E\u0433\u0430" })] }), _jsxs("select", { value: settings.score_threshold, onChange: (e) => mutation.mutate({ ...settings, score_threshold: Number(e.target.value) }), style: {
                            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
                        }, children: [_jsx("option", { value: 40, children: "40" }), _jsx("option", { value: 50, children: "50" }), _jsx("option", { value: 60, children: "60" }), _jsx("option", { value: 70, children: "70" })] })] }), _jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "\u041D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C (\u0447\u0430\u0441\u044B)" }), _jsx("div", { className: "toggle-desc", children: "\u0410\u043B\u0435\u0440\u0442 \u0435\u0441\u043B\u0438 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0435" })] }), _jsxs("select", { value: settings.no_activity_hours, onChange: (e) => mutation.mutate({ ...settings, no_activity_hours: Number(e.target.value) }), style: {
                            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
                        }, children: [_jsx("option", { value: 2, children: "2 \u0447\u0430\u0441\u0430" }), _jsx("option", { value: 4, children: "4 \u0447\u0430\u0441\u0430" }), _jsx("option", { value: 8, children: "8 \u0447\u0430\u0441\u043E\u0432" }), _jsx("option", { value: 12, children: "12 \u0447\u0430\u0441\u043E\u0432" }), _jsx("option", { value: 24, children: "24 \u0447\u0430\u0441\u0430" })] })] }), mutation.isPending && (_jsx("div", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435..." }))] }));
}
function IntegrationsTab() {
    const [showApiInfo, setShowApiInfo] = useState(false);
    return (_jsxs("div", { children: [_jsxs("div", { className: "toggle-row", children: [_jsxs("div", { className: "toggle-label-group", children: [_jsx("div", { className: "toggle-title", children: "REST API" }), _jsx("div", { className: "toggle-desc", children: "\u0414\u043E\u0441\u0442\u0443\u043F \u0447\u0435\u0440\u0435\u0437 API \u0434\u043B\u044F \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438 \u0441 \u0432\u043D\u0435\u0448\u043D\u0438\u043C\u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u0430\u043C\u0438" })] }), _jsx("div", { className: `toggle-switch ${showApiInfo ? 'on' : ''}`, onClick: () => setShowApiInfo(!showApiInfo) })] }), showApiInfo && (_jsxs("div", { style: {
                    background: 'var(--bg)', padding: '16px', borderRadius: 8, marginTop: 12,
                }, children: [_jsx("p", { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }, children: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F API \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443:" }), _jsxs("div", { style: {
                            background: 'var(--bg-card)', padding: '10px', borderRadius: 6,
                            fontSize: 12, fontFamily: 'monospace',
                        }, children: ["/docs/auth/ \u2014 \u0410\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F", _jsx("br", {}), "/docs/admin/ \u2014 \u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435", _jsx("br", {}), "/docs/dashboard/ \u2014 \u0414\u0430\u0448\u0431\u043E\u0440\u0434", _jsx("br", {}), "/docs/scripts/ \u2014 \u0421\u043A\u0440\u0438\u043F\u0442\u044B", _jsx("br", {}), "/docs/recorder/ \u2014 \u0417\u0430\u043F\u0438\u0441\u044C", _jsx("br", {})] })] }))] }));
}
