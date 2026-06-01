import { apiGet } from './api'
import type { AuditLogEntry } from '../types/admin'

export async function fetchAuditLog(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v)
  })
  const qs = q.toString()
  return apiGet<{ logs: AuditLogEntry[] }>(`/api/admin/audit-log${qs ? `?${qs}` : ''}`)
}
