import { lazy, type ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { useOrganization } from '@/lib/terms'

// Страницы грузятся отдельными чанками: так первый экран не тянет весь интерфейс
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')
const ConversationsPage = page(() => import('@/pages/ConversationsPage'), 'ConversationsPage')
const ConversationPage = page(() => import('@/pages/ConversationPage'), 'ConversationPage')
const TeamPage = page(() => import('@/pages/TeamPage'), 'TeamPage')
const MotivationPage = page(() => import('@/pages/MotivationPage'), 'MotivationPage')
const UpsellsPage = page(() => import('@/pages/UpsellsPage'), 'UpsellsPage')
const DemandPage = page(() => import('@/pages/DemandPage'), 'DemandPage')
const ScriptsPage = page(() => import('@/pages/ScriptsPage'), 'ScriptsPage')
const AnalyticsPage = page(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage')
const CompliancePage = page(() => import('@/pages/CompliancePage'), 'CompliancePage')
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage')
const AdminPage = page(() => import('@/pages/AdminPage'), 'AdminPage')
const ClinicOverviewPage = page(() => import('@/pages/ClinicOverviewPage'), 'ClinicOverviewPage')
const VisitsPage = page(() => import('@/pages/VisitsPage'), 'VisitsPage')
const VisitPage = page(() => import('@/pages/VisitPage'), 'VisitPage')
const DoctorsPage = page(() => import('@/pages/DoctorsPage'), 'DoctorsPage')
const DoctorPage = page(() => import('@/pages/DoctorsPage'), 'DoctorPage')
const QualityRulesPage = page(() => import('@/pages/QualityRulesPage'), 'QualityRulesPage')

/** Главная: у кофеен и аптек — «Допродажи» (смена у кассы), у клиник — обзор качества приёмов,
 *  у остальных — «Обзор» */
function Home() {
  const { data, isLoading } = useOrganization()
  if (isLoading) return null
  const to = data?.industry === 'coffee' || data?.industry === 'pharmacy' ? '/upsells' : data?.industry === 'clinic' ? '/clinic' : '/dashboard'
  return <Navigate to={to} replace />
}

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
              <Route index element={<Home />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="conversations/:id" element={<ConversationPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="upsells" element={<UpsellsPage />} />
              <Route path="demand" element={<DemandPage />} />
              <Route path="motivation" element={<MotivationPage />} />
              <Route path="scripts" element={<ScriptsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="intelligence" element={<Navigate to="/dashboard" replace />} />
              <Route path="training" element={<Navigate to="/dashboard" replace />} />
              <Route path="compliance" element={<CompliancePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="clinic" element={<ClinicOverviewPage />} />
              <Route path="visits" element={<VisitsPage />} />
              <Route path="visits/:id" element={<VisitPage />} />
              <Route path="doctors" element={<DoctorsPage />} />
              <Route path="doctors/:id" element={<DoctorPage />} />
              <Route path="quality-rules" element={<QualityRulesPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
