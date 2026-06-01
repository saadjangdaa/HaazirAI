import type { AdminSession } from '../types/admin'

const SESSION_KEY = 'admin_session'

export function loadSession(): AdminSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AdminSession
  } catch {
    return null
  }
}

export function saveSession(session: AdminSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  if (session.token) localStorage.setItem('admin_token', session.token)
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_dev_uid')
}

/** Firebase email/password via REST (no SDK required). */
export async function loginWithEmail(email: string, password: string): Promise<AdminSession> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const devBypass =
    import.meta.env.VITE_DEV_LOGIN === 'true' ||
    (!apiKey && !email.trim() && !password.trim())

  if (devBypass) {
    const devUid = import.meta.env.VITE_ADMIN_DEV_UID || 'dev_super_admin'
    localStorage.setItem('admin_dev_uid', devUid)
    const session: AdminSession = {
      uid: devUid,
      email: 'dev@haazir.local',
      name: 'Dev Admin',
      role: 'super_admin',
    }
    saveSession(session)
    return session
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Login failed')

  const session: AdminSession = {
    uid: data.localId,
    email: data.email,
    name: data.email?.split('@')[0] || 'Admin',
    role: 'viewer',
    token: data.idToken,
  }
  saveSession(session)
  return session
}
