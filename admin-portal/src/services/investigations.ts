import { apiGet, apiSend } from './api'
import type { Investigation } from '../types/investigation'

export async function fetchInvestigations(status?: string) {
  const q = new URLSearchParams()
  if (status && status !== 'all') q.set('status', status)
  const qs = q.toString()
  return apiGet<{ investigations: Investigation[]; count: number }>(`/api/admin/investigations${qs ? `?${qs}` : ''}`)
}

export const decideInvestigation = (
  investigationId: string,
  body: { action: string; reason: string; suspend_days?: number },
) => apiSend<Investigation>(`/api/admin/investigations/${investigationId}/decision`, 'PATCH', body)
