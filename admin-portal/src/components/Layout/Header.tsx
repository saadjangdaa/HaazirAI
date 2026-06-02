import { useAuth } from '../../hooks/useAuth'

export function Header() {
  const { session, logout } = useAuth()
  return (
    <header className="header">
      <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {session?.name || session?.email} · {session?.role?.replace('_', ' ')}
      </span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
        Logout
      </button>
    </header>
  )
}
