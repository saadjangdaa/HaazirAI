import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../components/Common/Badge'
import { Modal } from '../components/Common/Modal'
import { useAuth } from '../hooks/useAuth'
import { fetchDisputes, getDispute, resolveDispute, updateDisputeStatus } from '../services/disputes'
import type { Dispute } from '../types/dispute'
import { formatDate } from '../utils/dates'
import { formatRs } from '../utils/formatting'

export function DisputesPage() {
  const { canWrite } = useAuth()
  const [rows, setRows] = useState<Dispute[]>([])
  const [filters, setFilters] = useState({ status: 'all', type: 'all', priority: 'all', search: '' })
  const [selected, setSelected] = useState<Dispute | null>(null)
  const [form, setForm] = useState({
    decision: 'provider_at_fault',
    refund_amount: 0,
    compensation_amount: 0,
    action_warn: false,
    action_suspend_days: 0,
    action_blacklist: false,
    action_none: true,
    admin_notes: '',
  })

  const load = useCallback(() => {
    fetchDisputes(filters).then((r) => setRows(r.disputes)).catch(console.error)
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const openView = async (id: string) => {
    const d = await getDispute(id)
    setForm((f) => ({ ...f, refund_amount: d.scheduled_price || 0 }))
    setSelected(d)
  }

  return (
    <>
      <h1 className="page-title">Dispute Management</h1>
      <div className="filters">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          {['all', 'open', 'in_review', 'resolved', 'on_hold'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Booking</th>
              <th>Customer</th>
              <th>Provider</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.dispute_id}</td>
                <td>{d.booking_id}</td>
                <td>{d.customer_name}</td>
                <td>{d.provider_name}</td>
                <td>{d.type}</td>
                <td>
                  <Badge status={d.status} />
                </td>
                <td>{formatDate(d.created_at)}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openView(d.id)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={`Dispute ${selected.dispute_id}`} onClose={() => setSelected(null)}>
          <p>
            <Badge status={selected.status} /> · {selected.type} · {selected.priority}
          </p>
          <p>Booking: {selected.booking_id}</p>
          <p>
            Customer: {selected.customer_name} · Provider: {selected.provider_name}
          </p>
          <p>Service: {selected.service} · {formatDate(selected.scheduled_time)} · {formatRs(selected.scheduled_price || 0)}</p>
          <p style={{ marginTop: '0.75rem' }}>{selected.description}</p>
          {canWrite('disputes') && selected.status !== 'resolved' && (
            <>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Decision</label>
                <select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>
                  <option value="provider_at_fault">Provider at fault</option>
                  <option value="customer_at_fault">Customer at fault</option>
                  <option value="both_fault">Both fault</option>
                  <option value="unable_to_determine">Unable to determine</option>
                </select>
              </div>
              <div className="form-group">
                <label>Refund (Rs)</label>
                <input type="number" value={form.refund_amount} onChange={(e) => setForm({ ...form, refund_amount: Number(e.target.value) })} />
              </div>
              <textarea placeholder="Admin notes" value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await resolveDispute(selected.id, { ...form, status: 'resolved' })
                    setSelected(null)
                    load()
                  }}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    await updateDisputeStatus(selected.id, 'on_hold', form.admin_notes)
                    setSelected(null)
                    load()
                  }}
                >
                  Put on hold
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
