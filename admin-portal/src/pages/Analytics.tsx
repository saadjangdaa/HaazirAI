import { useEffect, useState } from 'react'
import { fetchAnalytics } from '../services/analytics'
import { formatRs } from '../utils/formatting'

export function AnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    fetchAnalytics().then((d) => setData(d)).catch(console.error)
  }, [])

  const p = (data?.providers || {}) as Record<string, unknown>
  const b = (data?.bookings || {}) as Record<string, unknown>
  const r = (data?.revenue || {}) as Record<string, unknown>
  const d = (data?.disputes || {}) as Record<string, unknown>

  return (
    <>
      <h1 className="page-title">Analytics</h1>

      <section className="card analytics-section">
        <h3>Provider Overview</h3>
        <div className="stat-row">
          <Stat label="Total" value={p.total} />
          <Stat label="Active" value={`${p.active} (${pct(p.active, p.total)})`} />
          <Stat label="Pending" value={`${p.pending} (${pct(p.pending, p.total)})`} />
          <Stat label="Suspended" value={p.suspended} />
          <Stat label="Avg rating" value={`${p.avg_rating}/5`} />
        </div>
        <h4 style={{ marginTop: '1rem' }}>Top providers</h4>
        <ul>
          {((p.top_providers as Array<{ name: string; rating: number }>) || []).map((x, i) => (
            <li key={x.name}>
              {i + 1}. {x.name} — {x.rating}⭐
            </li>
          ))}
        </ul>
      </section>

      <section className="card analytics-section">
        <h3>Bookings</h3>
        <div className="stat-row">
          <Stat label="Total" value={b.total} />
          <Stat label="This month" value={b.this_month} />
          <Stat label="Today" value={b.today} />
        </div>
        <Breakdown title="By status" data={b.by_status as Record<string, number>} />
        <Breakdown title="By service" data={b.by_service as Record<string, number>} />
      </section>

      <section className="card analytics-section">
        <h3>Revenue</h3>
        <div className="stat-row">
          <Stat label="Gross" value={formatRs(Number(r.gross || 0))} />
          <Stat label="Commission (15%)" value={formatRs(Number(r.platform_commission || 0))} />
          <Stat label="Provider earnings" value={formatRs(Number(r.provider_earnings || 0))} />
        </div>
      </section>

      <section className="card analytics-section">
        <h3>Disputes</h3>
        <div className="stat-row">
          <Stat label="Total" value={d.total} />
          <Stat label="Resolved" value={d.resolved} />
          <Stat label="Pending" value={d.pending} />
          <Stat label="Avg resolution" value={`${d.avg_resolution_hours}h`} />
        </div>
        <Breakdown title="By type" data={d.by_type as Record<string, number>} />
      </section>
    </>
  )
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="stat-item">
      <span>{label}</span>
      <strong>{String(value ?? '—')}</strong>
    </div>
  )
}

function Breakdown({ title, data }: { title: string; data?: Record<string, number> }) {
  if (!data) return null
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1
  return (
    <>
      <h4 style={{ marginTop: '0.75rem' }}>{title}</h4>
      <ul>
        {Object.entries(data).map(([k, v]) => (
          <li key={k}>
            {k}: {v} ({Math.round((v / total) * 100)}%)
          </li>
        ))}
      </ul>
    </>
  )
}

function pct(part: unknown, whole: unknown): string {
  const p = Number(part) || 0
  const w = Number(whole) || 1
  return `${Math.round((p / w) * 100)}%`
}
