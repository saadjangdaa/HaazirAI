import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { PrivateRoute } from './components/Layout/PrivateRoute'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { ProvidersPage } from './pages/Providers'
import { DisputesPage } from './pages/Disputes'
import { AnalyticsPage } from './pages/Analytics'
import { AdminUsersPage } from './pages/AdminUsers'
import { AuditLogPage } from './pages/AuditLog'
import { InvestigationsPage } from './pages/Investigations'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route index element={<DashboardPage />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="disputes" element={<DisputesPage />} />
            <Route path="investigations" element={<InvestigationsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="admin-users" element={<AdminUsersPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
