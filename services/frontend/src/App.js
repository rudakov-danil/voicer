import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { useOrganization } from '@/lib/terms';
// Страницы грузятся отдельными чанками: так первый экран не тянет весь интерфейс
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage');
const ConversationsPage = page(() => import('@/pages/ConversationsPage'), 'ConversationsPage');
const ConversationPage = page(() => import('@/pages/ConversationPage'), 'ConversationPage');
const TeamPage = page(() => import('@/pages/TeamPage'), 'TeamPage');
const MotivationPage = page(() => import('@/pages/MotivationPage'), 'MotivationPage');
const UpsellsPage = page(() => import('@/pages/UpsellsPage'), 'UpsellsPage');
const DemandPage = page(() => import('@/pages/DemandPage'), 'DemandPage');
const ScriptsPage = page(() => import('@/pages/ScriptsPage'), 'ScriptsPage');
const AnalyticsPage = page(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage');
const CompliancePage = page(() => import('@/pages/CompliancePage'), 'CompliancePage');
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage');
const AdminPage = page(() => import('@/pages/AdminPage'), 'AdminPage');
const ClinicOverviewPage = page(() => import('@/pages/ClinicOverviewPage'), 'ClinicOverviewPage');
const VisitsPage = page(() => import('@/pages/VisitsPage'), 'VisitsPage');
const VisitPage = page(() => import('@/pages/VisitPage'), 'VisitPage');
const DoctorsPage = page(() => import('@/pages/DoctorsPage'), 'DoctorsPage');
const DoctorPage = page(() => import('@/pages/DoctorsPage'), 'DoctorPage');
const QualityRulesPage = page(() => import('@/pages/QualityRulesPage'), 'QualityRulesPage');
/** Главная: у кофеен и аптек — «Допродажи» (смена у кассы), у клиник — обзор качества приёмов,
 *  у остальных — «Обзор» */
function Home() {
    const { data, isLoading } = useOrganization();
    if (isLoading)
        return null;
    const to = data?.industry === 'coffee' || data?.industry === 'pharmacy' ? '/upsells' : data?.industry === 'clinic' ? '/clinic' : '/dashboard';
    return _jsx(Navigate, { to: to, replace: true });
}
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30000,
            retry: 1
        }
    }
});
export default function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { element: _jsx(ProtectedRoute, {}), children: _jsxs(Route, { element: _jsx(AppLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(Home, {}) }), _jsx(Route, { path: "dashboard", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "conversations", element: _jsx(ConversationsPage, {}) }), _jsx(Route, { path: "conversations/:id", element: _jsx(ConversationPage, {}) }), _jsx(Route, { path: "team", element: _jsx(TeamPage, {}) }), _jsx(Route, { path: "upsells", element: _jsx(UpsellsPage, {}) }), _jsx(Route, { path: "demand", element: _jsx(DemandPage, {}) }), _jsx(Route, { path: "motivation", element: _jsx(MotivationPage, {}) }), _jsx(Route, { path: "scripts", element: _jsx(ScriptsPage, {}) }), _jsx(Route, { path: "analytics", element: _jsx(AnalyticsPage, {}) }), _jsx(Route, { path: "intelligence", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "training", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "compliance", element: _jsx(CompliancePage, {}) }), _jsx(Route, { path: "settings", element: _jsx(SettingsPage, {}) }), _jsx(Route, { path: "admin", element: _jsx(AdminPage, {}) }), _jsx(Route, { path: "clinic", element: _jsx(ClinicOverviewPage, {}) }), _jsx(Route, { path: "visits", element: _jsx(VisitsPage, {}) }), _jsx(Route, { path: "visits/:id", element: _jsx(VisitPage, {}) }), _jsx(Route, { path: "doctors", element: _jsx(DoctorsPage, {}) }), _jsx(Route, { path: "doctors/:id", element: _jsx(DoctorPage, {}) }), _jsx(Route, { path: "quality-rules", element: _jsx(QualityRulesPage, {}) })] }) })] }) }) }));
}
