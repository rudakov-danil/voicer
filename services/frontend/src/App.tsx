import { lazy, type ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'

// Страницы грузятся отдельными чанками: так первый экран не тянет весь интерфейс
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')
const ConversationsPage = page(() => import('@/pages/ConversationsPage'), 'ConversationsPage')
const ConversationPage = page(() => import('@/pages/ConversationPage'), 'ConversationPage')
const TeamPage = page(() => import('@/pages/TeamPage'), 'TeamPage')
const ScriptsPage = page(() => import('@/pages/ScriptsPage'), 'ScriptsPage')
const AnalyticsPage = page(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage')
const CompliancePage = page(() => import('@/pages/CompliancePage'), 'CompliancePage')
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage')
const AdminPage = page(() => import('@/pages/AdminPage'), 'AdminPage')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  }
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="conversations/:id" element={<ConversationPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="scripts" element={<ScriptsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="intelligence" element={<Navigate to="/dashboard" replace />} />
              <Route path="training" element={<Navigate to="/dashboard" replace />} />
              <Route path="compliance" element={<CompliancePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
