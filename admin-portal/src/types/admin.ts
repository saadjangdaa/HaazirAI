import type { AdminRole } from './common'

export interface AdminUser {
  id: string
  uid: string
  email: string
  name: string
  role: AdminRole
  active: boolean
}

export interface AuditLogEntry {
  id: string
  admin_name: string
  action: string
  details: string
  timestamp: string
}

export interface AdminSession {
  uid: string
  email: string
  name: string
  role: AdminRole
  token?: string
}
