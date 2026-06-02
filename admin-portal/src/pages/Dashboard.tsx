import { useEffect, useState } from 'react'
import { ApiBanner } from '../components/Common/ApiBanner'
import { fetchBackendHealth } from '../services/api'
import { fetchDashboard } from '../services/analytics'
import { formatRs } from '../utils/formatting'
import { formatDate, timeAgo } from '../utils/dates'

export function DashboardPage() {
  const [data, setData] = useState<{
    metrics: Record<string, number>
    recent_activity: Array<Record<string, string>>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [firebaseMode, setFirebaseMode] = useState<string | null>(null)
  const [firebaseHint, setFirebaseHint] = useState<string | null>(null)

  useEffect(() => {
    fetchBackendHealth()
      .then((h) => {
        setFirebaseMode(h.firebase || null)
        setFirebaseHint(h.hint || null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchDashboard()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => {
        setData(null)
        setError(e.message || 'API request failed')
      })
  }, [])

  const m = data?.metrics || {}
  const cards = [
    { label: 'Total Providers', value: m.total_providers, icon: '👷' },
    { label: 'Pending Approvals', value: m.pending_approvals, icon: '⏳' },
    { label: 'Active Providers', value: m.active_providers, icon: '✅' },
    { label: 'Suspended', value: m.suspended_providers, icon: '⚠️' },
    { label: 'Open Disputes', value: m.open_disputes, icon: '⚖️' },
    { label: 'Resolved Today', value: m.resolved_today, icon: '✔️' },
    { label: 'Total Bookings', value: m.total_bookings, icon: '📅' },
    { label: 'Revenue Today', value: formatRs(m.revenue_today || 0), icon: '💰' },
  ]

  return (
    <>
      <h1 className="page-title">Haazir Dost Admin Dashboard</h1>
      {firebaseMode === 'mock' && (
        <ApiBanner
          message={
            firebaseHint ||
            'Backend mock Firestore use kar raha hai — mobile workers yahan nahi dikhenge. backend/firebase-key.json mein asli Firebase service account lagayein aur backend restart karein.'
          }
        />
      )}
      {error && <ApiBanner message={error} />}
      <div className="metrics-grid">
        {cards.map((c) => (
          <div key={c.label} className="metric-card">
            <div className="label">{c.icon} {c.label}</div>
            <div className="value">{c.value ?? '—'}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>Recent Activity</h3>
        <ul className="activity-list">
          {(data?.recent_activity || []).map((a) => (
            <li key={a.id}>
              <strong>{a.action}</strong> — {a.details}
              <br />
              <small style={{ color: 'var(--muted)' }}>
                {a.admin_name} · {timeAgo(a.timestamp)} ({formatDate(a.timestamp)})
              </small>
            </li>
          ))}
          {!data?.recent_activity?.length && <li>No activity yet</li>}
        </ul>
      </div>
    </>
  )
}
