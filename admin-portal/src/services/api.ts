const BASE = import.meta.env.VITE_API_BASE_URL || ''

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('admin_token')
  const devUid = localStorage.getItem('admin_dev_uid') || import.meta.env.VITE_ADMIN_DEV_UID
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  else if (devUid) headers['X-Admin-Uid'] = devUid
  return headers
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: getAuthHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = typeof err.detail === 'string' ? err.detail : res.statusText
    if (res.status === 404 && path.startsWith('/api/admin/')) {
      throw new Error(
        'Admin API is not on this server yet (404). Deploy the latest backend to Render, or set VITE_API_BASE_URL=http://localhost:8080 and run the backend locally.',
      )
    }
    throw new Error(detail || res.statusText)
  }
  return res.json()
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = typeof err.detail === 'string' ? err.detail : res.statusText
    if (res.status === 404 && path.startsWith('/api/admin/')) {
      throw new Error(
        'Admin API is not on this server yet (404). Deploy the latest backend to Render, or use localhost:8080.',
      )
    }
    throw new Error(detail || res.statusText)
  }
  return res.json()
}
