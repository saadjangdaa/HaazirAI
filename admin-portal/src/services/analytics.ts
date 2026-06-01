import { apiGet } from './api'

export const fetchAnalytics = () => apiGet<Record<string, unknown>>('/api/admin/analytics/all')
export const fetchDashboard = () =>
  apiGet<{ metrics: Record<string, number>; recent_activity: Array<Record<string, string>> }>(
    '/api/admin/dashboard',
  )
