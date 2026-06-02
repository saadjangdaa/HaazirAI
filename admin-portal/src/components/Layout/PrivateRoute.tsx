import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function PrivateRoute() {
  const { session, loading } = useAuth()
  if (loading) return <div className="login-page">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header />
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
