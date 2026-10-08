import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, AudioLines, Users, ScrollText, ShieldAlert, BarChart3, Settings as SettingsIcon, Wrench, LogOut, } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOrganization } from '@/lib/terms';
import { VoicerLogo } from '@/components/VoicerLogo';
import { t, isEn, setLang } from '@/i18n';
const MAIN = [
    { path: '/dashboard', label: 'Обзор', icon: LayoutGrid },
    { path: '/conversations', label: 'Разговоры', icon: AudioLines },
    { path: '/team', label: 'Команда', icon: Users },
    { path: '/scripts', label: 'Скрипты', icon: ScrollText },
];
const CONTROL = [
    { path: '/compliance', label: 'Комплаенс', icon: ShieldAlert },
    { path: '/analytics', label: 'Аналитика', icon: BarChart3 },
    { path: '/settings', label: 'Настройки', icon: SettingsIcon },
];
const ADMIN = { path: '/admin', label: 'Администрирование', icon: Wrench };
const ROLE_LABELS = {
    director: 'Директор',
    admin: 'Админ',
    rop: 'РОП',
    manager: 'Менеджер',
};
function initials(text) {
    return text
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}
export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const { data: org } = useOrganization();
    const isAdmin = user?.role === 'director' || user?.role === 'admin';
    const control = isAdmin ? [...CONTROL, ADMIN] : CONTROL;
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
    const renderItem = (item) => {
        const active = location.pathname === item.path;
        return (_jsxs("button", { type: "button", className: "nav-item", "aria-current": active ? 'page' : undefined, title: t(item.label), onClick: () => navigate(item.path), children: [_jsx(item.icon, { "aria-hidden": "true" }), _jsx("span", { children: t(item.label) })] }, item.path));
    };
    return (_jsxs("aside", { className: "sidebar", "aria-label": t('Навигация'), children: [_jsxs("a", { className: "brand", href: "/dashboard", onClick: (e) => { e.preventDefault(); navigate('/dashboard'); }, children: [_jsx(VoicerLogo, { size: 18 }), _jsx("span", { className: "brand-name", translate: "no", children: t('Войсер') })] }), org && (_jsxs("div", { className: "org-switch", children: [_jsx("span", { className: "org-logo", "aria-hidden": "true", translate: "no", children: initials(org.name) || 'V' }), _jsxs("div", { className: "ellipsis", children: [_jsx("div", { className: "org-name ellipsis", translate: "no", children: org.name }), _jsx("div", { className: "org-unit ellipsis", children: t('Розница') })] })] })), _jsxs("nav", { className: "nav", "aria-label": t('Разделы'), children: [MAIN.map(renderItem), _jsx("div", { className: "nav-label", children: t('Контроль') }), control.map(renderItem)] }), _jsx("div", { className: "sidebar-foot", children: _jsxs("div", { className: "me", children: [_jsx("span", { className: "avatar", "aria-hidden": "true", translate: "no", children: initials(fullName) || '?' }), _jsxs("div", { className: "me-meta", children: [_jsx("div", { className: "me-name ellipsis", translate: "no", children: fullName || user?.email }), _jsx("div", { className: "me-role", children: t(ROLE_LABELS[user?.role ?? ''] ?? 'Менеджер') })] }), _jsx("button", { type: "button", className: "lang-btn", translate: "no", "aria-label": isEn ? 'Переключить на русский' : 'Switch to English', title: isEn ? 'Переключить на русский' : 'Switch to English', onClick: () => setLang(isEn ? 'ru' : 'en'), children: isEn ? 'RU' : 'EN' }), _jsx("button", { type: "button", className: "btn-icon", "aria-label": t('Выйти'), title: t('Выйти'), onClick: () => { logout(); navigate('/login'); }, children: _jsx(LogOut, { size: 16, "aria-hidden": "true" }) })] }) })] }));
}
