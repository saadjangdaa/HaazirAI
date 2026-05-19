export interface Dispute {
  id: string
  dispute_id: string
  booking_id: string
  type: string
  status: string
  priority: string
  description: string
  evidence_urls: string[]
  created_at: string
  customer_name: string
  customer_phone?: string
  provider_name: string
  provider_phone?: string
  provider_id?: string
  service?: string
  scheduled_time?: string
  scheduled_price?: number
  admin_notes?: string
  refund_amount?: number
}
