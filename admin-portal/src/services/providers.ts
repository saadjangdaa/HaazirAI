import { apiGet, apiSend } from './api'
import type { Provider } from '../types/provider'

export async function fetchProviders(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== 'all') q.set(k, v)
  })
  const qs = q.toString()
  return apiGet<{ providers: Provider[]; count: number }>(`/api/admin/providers${qs ? `?${qs}` : ''}`)
}

export const getProvider = (id: string) => apiGet<Provider>(`/api/admin/providers/${id}`)
export const approveProvider = (id: string, notes = '') =>
  apiSend<Provider>(`/api/admin/providers/${id}/approve`, 'PATCH', { notes })
export const rejectProvider = (id: string, reason: string) =>
  apiSend<Provider>(`/api/admin/providers/${id}/reject`, 'PATCH', { reason })
export const suspendProvider = (id: string, body: { reason: string; duration_days?: number; permanent?: boolean }) =>
  apiSend<Provider>(`/api/admin/providers/${id}/suspend`, 'PATCH', body)
export const activateProvider = (id: string) =>
  apiSend<Provider>(`/api/admin/providers/${id}/activate`, 'PATCH', {})
export const deleteProvider = (id: string) =>
  apiSend<{ deleted: boolean }>(`/api/admin/providers/${id}`, 'DELETE')
