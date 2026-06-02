import type { ProviderStatus } from './common'

export interface ProviderDocument {
  verified?: boolean
  url?: string
}

export interface Provider {
  id: string
  provider_id: string
  name: string
  service: string
  city: string
  area?: string
  rating: number
  admin_status: ProviderStatus
  status: ProviderStatus
  verification_complete: boolean
  phone?: string
  email?: string
  firebase_uid?: string
  experience_years?: number
  created_at?: string
  suspended_until?: string | null
  suspend_reason?: string
  reject_reason?: string
  complaint_count?: number
  verified_complaint_count?: number
  trust_score?: number
  risk_score?: number
  late_arrival_count?: number
  investigation_status?: string
  recommended_action?: string
  documents?: Record<string, ProviderDocument>
  background_check?: { status: string; details: string; verified: boolean }
}
