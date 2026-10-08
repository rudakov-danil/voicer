import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Toaster } from '@/components/ui/Toast';
import { useState } from 'react';
const PAGES_WITH_PERIOD = new Set([
    '/dashboard',
    '/conversations',
    '/team',
    '/analytics',
    '/compliance',
]);
export function AppLayout() {
    const [period, setPeriod] = useState(30);
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
    return (_jsxs(_Fragment, { children: [_jsx(Sidebar, { period: period }), _jsxs("div", { className: "main", children: [!ownHeader && (_jsx(Topbar, { title: currentTitle, onPeriodChange: setPeriod, period: period, showPeriod: showPeriod })), _jsx("div", { className: "content", children: _jsx(Outlet, { context: { period, setPeriod } }) })] }), _jsx(Toaster, {})] }));
}
