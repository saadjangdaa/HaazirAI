export interface Investigation {
  id: string
  investigation_id: string
  provider_id: string
  provider_name: string
  provider_service?: string
  provider_city?: string
  status: string
  complaint_count: number
  verified_complaint_count: number
  trust_score: number
  risk_score: number
  completion_rate: number
  late_arrival_count: number
  customer_complaints: string[]
  worker_defense_statement?: string
  investigation_summary?: string
  recommended_action?: string
  confidence_score?: number
  created_at?: string
}
