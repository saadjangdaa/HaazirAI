import { apiGet, apiSend } from './api'
import type { AdminUser } from '../types/admin'

export const fetchAdminUsers = () => apiGet<{ users: AdminUser[] }>('/api/admin/users')
export const createAdminUser = (body: Record<string, unknown>) =>
  apiSend<AdminUser>('/api/admin/users', 'POST', body)
export const updateAdminUser = (id: string, body: Record<string, unknown>) =>
  apiSend<AdminUser>(`/api/admin/users/${id}`, 'PATCH', body)
export const deleteAdminUser = (id: string) =>
  apiSend<{ deleted: boolean }>(`/api/admin/users/${id}`, 'DELETE')
