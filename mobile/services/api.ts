import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

// Retry logic — 2 retries on timeout
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;
    if (!config || config._retryCount >= 2) return Promise.reject(err);
    if (err.code === 'ECONNABORTED' || err.response?.status >= 500) {
      config._retryCount = (config._retryCount || 0) + 1;
      await new Promise((r) => setTimeout(r, 1000 * config._retryCount));
      return client(config);
    }
    return Promise.reject(err);
  }
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Intent {
  service_type: string;
  location: string;
  city: string;
  time_preference: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  budget_sensitivity: 'low' | 'medium' | 'high';
  job_complexity: 'basic' | 'intermediate' | 'complex';
  emergency: boolean;
  confidence_score: number;
  clarification_needed: boolean;
  clarification_question?: string;
  detected_language: string;
  special_requirements?: string;
}

export interface Provider {
  id: string;
  name: string;
  service: string;
  specialization: string[];
  complexity_level: string;
  city: string;
  area: string;
  rating: number;
  review_count: number;
  recent_reviews_positive: number;
  on_time_percentage: number;
  cancellation_rate: number;
  available: boolean;
  available_slots: string[];
  price_per_hour: number;
  experience_years: number;
  verified: boolean;
  trust_score: number;
  jobs_completed: number;
  phone: string;
  lat: number;
  lng: number;
  languages: string[];
  tools_available: string[];
  pending_earnings: number;
  workload_today: number;
  ranking_score?: number;
  ranking_reason_urdu?: string;
  ranking_reason_english?: string;
  distance_km?: number;
  warnings?: string[];
}

export interface PriceBreakdown {
  base_price: number;
  distance_cost: number;
  urgency_adjustment: number;
  complexity_fee: number;
  surge_pricing: number;
  loyalty_discount: number;
  total: number;
  estimated_hours: number;
  budget_alternative?: { provider: string; total: number; tradeoff: string };
  fairness_note: string;
}

export interface Booking {
  booking_id: string;
  provider_id: string;
  user_id: string;
  service: string;
  scheduled_time: string;
  status: string;
  confirmation_message: string;
  receipt: Record<string, unknown>;
  reminder_times: string[];
  alternate_slots?: string[];
  calendar_entry: Record<string, unknown>;
}

export interface TrustAssessment {
  provider_id: string;
  trust_score: number;
  risk_flags: string[];
  recommended_action: string;
  warnings: string[];
}

export interface AgentLog {
  agent_name: string;
  agent_name_urdu: string;
  start_time: string;
  end_time: string;
  input_summary: string;
  output_summary: string;
  decision_made: string;
  confidence: number;
  fallback_used: boolean;
  time_seconds: number;
}

export interface FullOrchestrationResponse {
  request_id: string;
  clarification_needed: boolean;
  clarification_question?: string;
  extracted_intent?: Intent;
  providers_ranked?: Provider[];
  best_provider?: Provider;
  price_breakdown?: PriceBreakdown;
  booking?: Booking;
  trust_scores?: TrustAssessment[];
  agent_logs: AgentLog[];
  emergency?: boolean;
  fallback?: string;
}

export interface Bid {
  provider_id: string;
  provider_name: string;
  bid_price: number;
  eta_minutes: number;
  message: string;
  rating: number;
  negotiated: boolean;
  final_price: number;
}

export interface BiddingResponse {
  request_id: string;
  bids: Bid[];
  recommended_bid: Bid;
  negotiation_log: string[];
}

export interface BookingResponse {
  booking_id: string;
  receipt: Record<string, unknown>;
  confirmation_message: string;
  reminders: string[];
}

export interface DisputeResolution {
  booking_id: string;
  dispute_type: string;
  resolution: string;
  refund_amount: number;
  provider_penalty: string;
  case_summary: string;
  escalated_to_human: boolean;
}

export interface BookingStatus {
  booking_id: string;
  status: string;
  provider_id?: string;
  service?: string;
  scheduled_time?: string;
  tracking_steps: { step: string; done: boolean; time?: string }[];
}

export interface DailyReport {
  provider_id: string;
  provider_name: string;
  date: string;
  jobs_completed: number;
  total_earnings: number;
  average_rating: number;
  pending_payments: number;
  upcoming_bookings: Record<string, unknown>[];
  voice_summary_urdu: string;
  predictive_suggestions: string[];
}

// ─── API Functions ─────────────────────────────────────────────────────────────

export async function submitRequest(
  input: string,
  location: string,
  userId: string
): Promise<FullOrchestrationResponse> {
  const { data } = await client.post('/api/request', {
    user_input: input,
    user_location: location,
    user_id: userId,
  });
  return data;
}

export async function triggerBidding(
  requestId: string,
  userId: string
): Promise<BiddingResponse> {
  const { data } = await client.post('/api/bid', {
    request_id: requestId,
    user_id: userId,
  });
  return data;
}

export async function confirmBooking(params: {
  providerId: string;
  userId: string;
  service: string;
  time: string;
  priceAccepted: number;
}): Promise<BookingResponse> {
  const { data } = await client.post('/api/book', {
    provider_id: params.providerId,
    user_id: params.userId,
    service: params.service,
    time: params.time,
    price_accepted: params.priceAccepted,
  });
  return data;
}

export async function submitDispute(params: {
  bookingId: string;
  disputeType: string;
  description: string;
  evidenceUrl?: string;
}): Promise<DisputeResolution> {
  const { data } = await client.post('/api/dispute', {
    booking_id: params.bookingId,
    dispute_type: params.disputeType,
    description: params.description,
    evidence_url: params.evidenceUrl,
  });
  return data;
}

export async function getBookingStatus(id: string): Promise<BookingStatus> {
  const { data } = await client.get(`/api/booking/${id}`);
  return data;
}

export async function getAgentLogs(requestId: string): Promise<AgentLog[]> {
  const { data } = await client.get(`/api/logs/${requestId}`);
  return data.logs || [];
}

export async function submitFeedback(params: {
  bookingId: string;
  userId: string;
  providerId: string;
  rating: number;
  tags: string[];
  review?: string;
}): Promise<void> {
  await client.post('/api/feedback', {
    booking_id: params.bookingId,
    user_id: params.userId,
    provider_id: params.providerId,
    rating: params.rating,
    tags: params.tags,
    review: params.review,
  });
}

export async function getProviderReport(providerId: string): Promise<DailyReport> {
  const { data } = await client.get(`/api/provider/report/${providerId}`);
  return data;
}

export async function getAllProviders(city?: string, service?: string): Promise<Provider[]> {
  const params: Record<string, string> = {};
  if (city) params.city = city;
  if (service) params.service = service;
  const { data } = await client.get('/api/providers', { params });
  return data.providers || [];
}
