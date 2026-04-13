import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ConversationsPage } from '@/pages/ConversationsPage'
import { TeamPage } from '@/pages/TeamPage'
import { ScriptsPage } from '@/pages/ScriptsPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { IntelligencePage } from '@/pages/IntelligencePage'
import { TrainingPage } from '@/pages/TrainingPage'
import { CompliancePage } from '@/pages/CompliancePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AdminPage } from '@/pages/AdminPage'

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
              <Route path="team" element={<TeamPage />} />
              <Route path="scripts" element={<ScriptsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="intelligence" element={<IntelligencePage />} />
              <Route path="training" element={<TrainingPage />} />
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
