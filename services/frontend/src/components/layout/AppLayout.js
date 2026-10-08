import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { VoicerLogo } from '@/components/VoicerLogo';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Toaster } from '@/components/ui/Toast';
import { t, isEn, setLang } from '@/i18n';
import { Suspense, useState } from 'react';
const PAGES_WITH_PERIOD = new Set([
    '/dashboard',
    '/conversations',
    '/team',
    '/analytics',
    '/compliance',
]);
export function AppLayout() {
    const [period, setPeriod] = useState(30);
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const pageTitles = {
        '/dashboard': 'Обзор',
        '/conversations': 'Разговоры',
        '/team': 'Команда',
        '/scripts': 'Скрипты',
        '/analytics': 'Аналитика',
        '/intelligence': 'Разведка',
        '/training': 'Обучение',
        '/compliance': 'Комплаенс',
        '/settings': 'Настройки',
        '/admin': 'Администрирование',
    };
    const currentTitle = pageTitles[location.pathname] || 'Voicer';
    const showPeriod = PAGES_WITH_PERIOD.has(location.pathname);
    // У страницы разговора своя шапка: крошки, тема, вердикт
    const ownHeader = location.pathname.startsWith('/conversations/');
    return (_jsxs(_Fragment, { children: [_jsx(Sidebar, { period: period }), _jsxs("div", { className: "main", children: [_jsxs("header", { className: "mobile-bar", children: [_jsxs(Link, { className: "brand", to: "/dashboard", onClick: () => setMenuOpen(false), children: [_jsx(VoicerLogo, { size: 18 }), _jsx("span", { className: "brand-name", translate: "no", children: t('Войсер') })] }), _jsx("button", { type: "button", className: "lang-btn", translate: "no", onClick: () => setLang(isEn ? 'ru' : 'en'), "aria-label": isEn ? 'Переключить на русский' : 'Switch to English', children: isEn ? 'RU' : 'EN' }), _jsx("button", { type: "button", className: "btn-icon", "aria-label": t('Меню'), "aria-expanded": menuOpen, onClick: () => setMenuOpen((v) => !v), children: menuOpen ? _jsx(X, { size: 18, "aria-hidden": "true" }) : _jsx(Menu, { size: 18, "aria-hidden": "true" }) })] }), menuOpen && (_jsx("div", { className: "mobile-nav", children: _jsx(Sidebar, { period: period, mobile: true, onNavigate: () => setMenuOpen(false) }) })), !ownHeader && (_jsx(Topbar, { title: currentTitle, onPeriodChange: setPeriod, period: period, showPeriod: showPeriod })), _jsx("div", { className: "content", children: _jsx(Suspense, { fallback: _jsx("div", { className: "page-loading", role: "status", children: t('Загрузка...') }), children: _jsx(Outlet, { context: { period, setPeriod } }) }) })] }), _jsx(Toaster, {})] }));
}
