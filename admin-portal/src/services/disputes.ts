import { apiGet, apiSend } from './api'
import type { Dispute } from '../types/dispute'

export async function fetchDisputes(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== 'all') q.set(k, v)
  })
  const qs = q.toString()
  return apiGet<{ disputes: Dispute[]; count: number }>(`/api/admin/disputes${qs ? `?${qs}` : ''}`)
}

export const getDispute = (id: string) => apiGet<Dispute>(`/api/admin/disputes/${id}`)
export const resolveDispute = (id: string, body: Record<string, unknown>) =>
  apiSend<Dispute>(`/api/admin/disputes/${id}/resolve`, 'PATCH', body)
export const updateDisputeStatus = (id: string, status: string, admin_notes: string) =>
  apiSend<Dispute>(`/api/admin/disputes/${id}/status`, 'PATCH', { status, admin_notes })
