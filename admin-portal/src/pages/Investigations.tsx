import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../components/Common/Badge'
import { Modal } from '../components/Common/Modal'
import { useAuth } from '../hooks/useAuth'
import { decideInvestigation, fetchInvestigations } from '../services/investigations'
import type { Investigation } from '../types/investigation'
import { formatDate } from '../utils/dates'

export function InvestigationsPage() {
  const { canWrite } = useAuth()
  const [rows, setRows] = useState<Investigation[]>([])
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<Investigation | null>(null)
  const [decision, setDecision] = useState('keep_active')
  const [reason, setReason] = useState('')
  const [suspendDays, setSuspendDays] = useState(7)

  const load = useCallback(() => {
    fetchInvestigations(status).then((r) => setRows(r.investigations)).catch(console.error)
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <h1 className="page-title">Investigation Queue</h1>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {['all', 'awaiting_worker_defense', 'admin_review', 'closed'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Complaints</th>
              <th>Trust</th>
              <th>Risk</th>
              <th>Late</th>
              <th>Recommendation</th>
              <th>Confidence</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.provider_name}</td>
                <td>{i.verified_complaint_count}/{i.complaint_count}</td>
                <td>{Number(i.trust_score || 0).toFixed(2)}</td>
                <td>{Number(i.risk_score || 0).toFixed(2)}</td>
                <td>{i.late_arrival_count || 0}</td>
                <td>{i.recommended_action || 'keep_active'}</td>
                <td>{Number(i.confidence_score || 0).toFixed(2)}</td>
                <td><Badge status={i.status} /></td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(i)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={`Investigation ${selected.investigation_id}`} onClose={() => setSelected(null)}>
          <p><strong>Provider:</strong> {selected.provider_name} ({selected.provider_id})</p>
          <p><strong>Created:</strong> {formatDate(selected.created_at)}</p>
          <p><strong>Complaints:</strong> {selected.verified_complaint_count}/{selected.complaint_count}</p>
          <p><strong>Trust/Risk:</strong> {Number(selected.trust_score || 0).toFixed(2)} / {Number(selected.risk_score || 0).toFixed(2)}</p>
          <p><strong>Completion/Late:</strong> {Number(selected.completion_rate || 0).toFixed(2)} / {selected.late_arrival_count || 0}</p>
          <p><strong>Worker Defense:</strong> {selected.worker_defense_statement || 'Not submitted'}</p>
          <p><strong>Summary:</strong> {selected.investigation_summary || 'Pending analysis'}</p>
          <p><strong>Recommended:</strong> {selected.recommended_action || 'keep_active'} ({Number(selected.confidence_score || 0).toFixed(2)})</p>

          <h4 style={{ marginTop: '1rem' }}>Customer Complaints</h4>
          {(selected.customer_complaints || []).slice(0, 5).map((c, idx) => (
            <p key={idx}>- {c}</p>
          ))}

          {canWrite('disputes') && selected.status !== 'closed' && (
            <>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Admin Action</label>
                <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                  <option value="keep_active">Keep Active</option>
                  <option value="warning">Issue Warning</option>
                  <option value="temporary_suspend">Temporary Suspend</option>
                  <option value="disable_provider">Permanently Disable</option>
                  <option value="request_more_evidence">Request More Evidence</option>
                </select>
              </div>
              {decision === 'temporary_suspend' && (
                <div className="form-group">
                  <label>Suspend days</label>
                  <input type="number" value={suspendDays} onChange={(e) => setSuspendDays(Number(e.target.value))} />
                </div>
              )}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await decideInvestigation(selected.id, {
                      action: decision,
                      reason: reason || 'Admin decision',
                      suspend_days: decision === 'temporary_suspend' ? suspendDays : undefined,
                    })
                    setSelected(null)
                    load()
                  }}
                >
                  Apply Action
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
