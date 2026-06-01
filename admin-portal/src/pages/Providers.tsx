import { useCallback, useEffect, useState } from 'react'
import { ApiBanner } from '../components/Common/ApiBanner'
import { Badge } from '../components/Common/Badge'
import { Modal } from '../components/Common/Modal'
import { useAuth } from '../hooks/useAuth'
import {
  activateProvider,
  approveProvider,
  deleteProvider,
  fetchProviders,
  getProvider,
  rejectProvider,
  suspendProvider,
} from '../services/providers'
import type { Provider } from '../types/provider'
import { formatDate } from '../utils/dates'

const STATUSES = ['all', 'pending', 'active', 'inactive', 'suspended', 'rejected']
const CITIES = ['all', 'Islamabad', 'Lahore', 'Karachi']
const SERVICES = ['all', 'AC', 'Electrical', 'Plumbing', 'Hair']

export function ProvidersPage() {
  const { canWrite } = useAuth()
  const [rows, setRows] = useState<Provider[]>([])
  const [filters, setFilters] = useState({ status: 'pending', city: 'all', service: 'all', search: '' })
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Provider | null>(null)
  const [rejectReason, setRejectReason] = useState('Document fraud')
  const [suspendReason, setSuspendReason] = useState('Poor quality')
  const [suspendDays, setSuspendDays] = useState(7)

  const load = useCallback(() => {
    fetchProviders(filters)
      .then((r) => {
        setRows(r.providers)
        setError(null)
      })
      .catch((e: Error) => {
        setRows([])
        setError(e.message || 'Could not load providers')
      })
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const openView = async (id: string) => {
    const p = await getProvider(id)
    setSelected(p)
  }

  const act = async (fn: () => Promise<unknown>) => {
    await fn()
    setSelected(null)
    load()
  }

  return (
    <>
      <h1 className="page-title">Provider Management</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '0.75rem' }}>
        Naye worker signups yahan <strong>pending</strong> status mein dikhte hain — View → Approve.
      </p>
      {error && <ApiBanner message={error} />}
      <div className="filters">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })}>
          {CITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}>
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          placeholder="Search name / phone"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Service</th>
              <th>City</th>
              <th>Rating</th>
              <th>Status</th>
              <th>Verified</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)' }}>
                  Koi provider nahi — worker ne mobile se signup complete kiya? Status filter &quot;pending&quot; check karein.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.service}</td>
                <td>{p.city}</td>
                <td>{p.admin_status === 'active' ? `${p.rating}⭐` : '—'}</td>
                <td>
                  <Badge status={p.admin_status} />
                </td>
                <td>{p.verification_complete ? '✅' : '❌'}</td>
                <td>{formatDate(p.created_at)}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openView(p.id)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <p>
            <strong>Phone:</strong> {selected.phone || '—'} · <strong>Email:</strong> {selected.email || '—'}
          </p>
          {selected.firebase_uid && (
            <p>
              <strong>Firebase UID:</strong> <code>{selected.firebase_uid}</code>
            </p>
          )}
          <p>
            {selected.city}, {selected.area} · {selected.service} · {selected.experience_years || 0} yrs
          </p>
          <h4 style={{ marginTop: '1rem' }}>Documents</h4>
          {Object.entries(selected.documents || {}).map(([k, d]) => (
            <p key={k}>
              {k}: {d?.verified ? '✅' : '⏳'} {d?.url && <a href={d.url} target="_blank" rel="noreferrer">View</a>}
            </p>
          ))}
          {canWrite('providers') && (
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              {selected.admin_status === 'pending' && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => act(() => approveProvider(selected.id))}>
                    Approve
                  </button>
                  <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reject reason" />
                  <button type="button" className="btn btn-danger" onClick={() => act(() => rejectProvider(selected.id, rejectReason))}>
                    Reject
                  </button>
                </>
              )}
              {selected.admin_status === 'active' && (
                <>
                  <select value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}>
                    <option>Poor quality</option>
                    <option>Multiple complaints</option>
                    <option>High cancellation rate</option>
                    <option>Document fraud</option>
                    <option>Other</option>
                  </select>
                  <select value={suspendDays} onChange={(e) => setSuspendDays(Number(e.target.value))}>
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={0}>Permanent</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() =>
                      act(() =>
                        suspendProvider(selected.id, {
                          reason: suspendReason,
                          duration_days: suspendDays || undefined,
                          permanent: suspendDays === 0,
                        }),
                      )
                    }
                  >
                    Suspend
                  </button>
                </>
              )}
              {selected.admin_status === 'suspended' && (
                <button type="button" className="btn btn-primary" onClick={() => act(() => activateProvider(selected.id))}>
                  Activate
                </button>
              )}
              <button type="button" className="btn btn-danger" onClick={() => act(() => deleteProvider(selected.id))}>
                Delete profile
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
