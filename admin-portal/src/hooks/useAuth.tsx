import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AdminSession } from '../types/admin'
import { clearSession, loadSession, loginWithEmail } from '../services/auth'
import { apiGet } from '../services/api'

interface AuthCtx {
  session: AdminSession | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  canWrite: (section: string) => boolean
}

const AuthContext = createContext<AuthCtx | null>(null)

const WRITE: Record<string, string[]> = {
  providers: ['super_admin', 'provider_manager'],
  disputes: ['super_admin', 'dispute_manager'],
  admin_users: ['super_admin'],
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = loadSession()
    if (!s) {
      setLoading(false)
      return
    }
    apiGet<AdminSession>('/api/admin/me')
      .then((me) => setSession({ ...s, ...me }))
      .catch(() => setSession(s))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const s = await loginWithEmail(email, password)
    const me = await apiGet<AdminSession>('/api/admin/me').catch(() => s)
    setSession({ ...s, ...me })
  }

  const logout = () => {
    clearSession()
    setSession(null)
  }

  const canWrite = (section: string) => {
    if (!session) return false
    if (session.role === 'super_admin') return true
    return (WRITE[section] || []).includes(session.role)
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, canWrite }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
