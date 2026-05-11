import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useState } from 'react';
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
        '/admin': 'Администрирование'
    };
    const currentTitle = pageTitles[location.pathname] || 'VoiceIQ';
    return (_jsxs(_Fragment, { children: [_jsx(Sidebar, {}), _jsxs("div", { className: "main", children: [_jsx(Topbar, { title: currentTitle, onPeriodChange: setPeriod, period: period }), _jsx("div", { className: "content", children: _jsx(Outlet, { context: { period } }) })] })] }));
}
