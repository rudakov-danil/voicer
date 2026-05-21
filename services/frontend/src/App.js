import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ConversationsPage } from '@/pages/ConversationsPage';
import { TeamPage } from '@/pages/TeamPage';
import { ScriptsPage } from '@/pages/ScriptsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { CompliancePage } from '@/pages/CompliancePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AdminPage } from '@/pages/AdminPage';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30000,
            retry: 1
        }
    }
});
export default function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { element: _jsx(ProtectedRoute, {}), children: _jsxs(Route, { element: _jsx(AppLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "dashboard", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "conversations", element: _jsx(ConversationsPage, {}) }), _jsx(Route, { path: "team", element: _jsx(TeamPage, {}) }), _jsx(Route, { path: "scripts", element: _jsx(ScriptsPage, {}) }), _jsx(Route, { path: "analytics", element: _jsx(AnalyticsPage, {}) }), _jsx(Route, { path: "intelligence", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "training", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "compliance", element: _jsx(CompliancePage, {}) }), _jsx(Route, { path: "settings", element: _jsx(SettingsPage, {}) }), _jsx(Route, { path: "admin", element: _jsx(AdminPage, {}) })] }) })] }) }) }));
}
