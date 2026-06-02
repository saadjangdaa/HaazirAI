import { useCallback, useEffect, useState } from 'react'
import { fetchAuditLog } from '../services/auditLog'
import type { AuditLogEntry } from '../types/admin'
import { formatDate } from '../utils/dates'

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [filters, setFilters] = useState({ action: '', search: '' })

  const load = useCallback(() => {
    fetchAuditLog(filters).then((r) => setLogs(r.logs)).catch(console.error)
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <h1 className="page-title">Audit Trail</h1>
      <div className="filters">
        <input placeholder="Filter action" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
        <input placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      </div>
      <div className="card">
        <ul className="activity-list">
          {logs.map((log) => (
            <li key={log.id}>
              <strong>[{formatDate(log.timestamp)}]</strong> {log.admin_name} — {log.action}
              <br />
              {log.details}
            </li>
          ))}
          {!logs.length && <li>No audit entries</li>}
        </ul>
      </div>
    </>
  )
}
