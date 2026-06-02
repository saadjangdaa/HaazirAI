import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/providers', label: 'Providers' },
  { to: '/disputes', label: 'Disputes' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/admin-users', label: 'Admin Users', role: 'super_admin' },
  { to: '/audit-log', label: 'Audit Log' },
]

export function Sidebar() {
  const { session } = useAuth()
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Haazir Dost Admin</div>
      <nav>
        {links.map((l) => {
          if (l.role && session?.role !== l.role && session?.role !== 'super_admin') return null
          return (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
