import axios, { AxiosError, AxiosInstance } from 'axios';
import { waitForAuthUser } from './authSession';
import { auth } from './firebase';

export function getApiBaseUrl(): string {
  const url = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080').trim();
  return url.replace(/\/$/, '');
}

const client: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

if (__DEV__) {
  console.log('[Haazir API] Base URL:', getApiBaseUrl());
  if (getApiBaseUrl().includes('localhost') || getApiBaseUrl().includes('127.0.0.1')) {
    console.warn(
      '[Haazir API] localhost phone par kaam nahi karega — mobile/.env mein PC ka LAN IP use karein (ipconfig)'
    );
  }
}

client.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const config = err.config as typeof err.config & { _retryCount?: number; _noRetry?: boolean };
    // Don't retry if explicitly disabled (e.g. bootstrap short-timeout requests)
    // or if we've already retried twice.
    if (!config || config._noRetry || (config._retryCount ?? 0) >= 2) return Promise.reject(err);
    const retryable =
      err.code === 'ECONNABORTED' ||
      err.code === 'ERR_NETWORK' ||
      !err.response ||
      (err.response.status >= 500);
    if (retryable) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      await new Promise((r) => setTimeout(r, 1000 * config._retryCount!));
      return client(config);
    }
    return Promise.reject(err);
  }
);

export function formatApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !err.response) {
      const base = getApiBaseUrl();
      if (base.includes('localhost') || base.includes('127.0.0.1')) {
        return (
          'Phone localhost tak nahi pohanch sakta.\n\n' +
          'mobile/.env mein apna PC IP likhein, masalan:\n' +
          'EXPO_PUBLIC_API_URL=http://192.168.0.101:8080\n\n' +
          'Phir: npm run start:lan (Expo restart)\n' +
          'Backend (repo root): python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080'
        );
      }
      return (
        'Backend se rabta nahi (Network Error).\n\n' +
        `• URL: ${base}\n` +
        '• Backend chal raha ho? (port 8080)\n' +
        '• Phone + PC same Wi‑Fi?\n' +
        `• Phone browser test: ${base}/health`
      );
    }
    const detail = err.response?.data;
    if (typeof detail === 'object' && detail && 'detail' in detail) {
      const d = (detail as { detail: unknown }).detail;
      return typeof d === 'string' ? d : JSON.stringify(d);
    }
    if (err.response?.status) {
      return `Server error (${err.response.status})`;
    }
  }
  if (err instanceof Error) return err.message;
  return 'Kuch masla hua — dobara try karein';
}

export async function pingApi(): Promise<{ ok: boolean; url: string }> {
  const url = getApiBaseUrl();
  // Render free tier can take 30+ seconds on cold start — use a generous timeout
  const PING_TIMEOUT = 35000;
  try {
    const { data } = await client.get('/health', { timeout: PING_TIMEOUT, _noRetry: true } as Record<string, unknown>);
    const ok = data?.status === 'ok';
    if (__DEV__ && ok) console.log('[Haazir API] Backend reachable at', url);
    return { ok, url };
  } catch (e) {
    if (__DEV__) console.warn('[Haazir API] Unreachable at', url, e);
    return { ok: false, url };
  }
}

export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType = 'audio/m4a'
): Promise<{ text: string; detected_language: string }> {
  const { data } = await client.post('/api/voice/transcribe', {
    audio_base64: audioBase64,
    mime_type: mimeType,
  });
  return {
    text: data.text || '',
    detected_language: data.detected_language || 'roman_urdu',
  };
}

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
  dispute_id?: string;
  dispute_status?: string;
  resolution: string;
  refund_amount: number;
  provider_penalty: string;
  case_summary: string;
  escalated_to_human: boolean;
  worker_id?: string;
  worker_response_pending?: boolean;
  message?: string;
  instant_resolve?: boolean;
  hifazat_summary?: {
    complaint_verdict?: string;
    recommended_action?: string;
    trust_score?: number;
  };
  already_finalized?: boolean;
}

export interface DisputeWorkerResponse {
  message: string;
  timestamp: string;
}

export interface DisputeRecord {
  dispute_id: string;
  booking_id: string;
  user_id?: string;
  worker_id?: string;
  type: string;
  status: string;
  resolution?: string;
  description?: string;
  customer_message?: string;
  worker_response?: DisputeWorkerResponse | null;
  refund_amount?: number;
  provider_penalty?: string;
  escalated_to_human?: boolean;
  case_summary?: string;
  created_at?: string;
  resolved_at?: string;
}

export interface BookingStatus {
  booking_id: string;
  status: string;
  provider_id?: string;
  provider_name?: string;
  service?: string;
  scheduled_time?: string;
  price?: number;
  tracking_steps: { step: string; done: boolean; key?: string; time?: string }[];
}

export interface UserBooking extends BookingStatus {
  user_id?: string;
  created_at?: string;
  emergency?: boolean;
  slot_time?: string;
  price?: number;
}

export interface UserProfile {
  user_id: string;
  email?: string;
  username?: string;
  name?: string;
  display_name?: string;
  phone?: string;
  cnic?: string;
  city?: string;
  role?: 'customer' | 'worker';
  /** Worker only: none | pending | active | rejected | suspended | inactive */
  approval_status?: string;
  profile_complete?: boolean;
  push_token?: string;
  /** Unified worker fields on users/{uid} */
  skills?: string[];
  areas?: string[];
  availability?: boolean;
  rating?: number;
  price_per_service?: number;
  experience_years?: number;
  provider_id?: string;
  worker_data?: Record<string, unknown>;
  created_at?: string;
  last_login?: string;
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
  userId: string;
  disputeType: string;
  description: string;
  evidenceUrl?: string;
}): Promise<DisputeResolution> {
  const userId = (params.userId || '').trim();
  if (!userId) {
    throw new Error('Login zaroori hai — Firebase account se sign in karein');
  }
  try {
    const { data } = await client.post('/api/dispute', {
      booking_id: params.bookingId,
      user_id: userId,
      dispute_type: params.disputeType,
      description: params.description,
      evidence_url: params.evidenceUrl,
    });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      throw new Error(
        'Backend purana version chal raha hai (sirf ek dispute allowed tha). ' +
          'Server restart karein: python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080'
      );
    }
    throw err;
  }
}

export async function getUserDisputes(userId: string): Promise<DisputeRecord[]> {
  const { data } = await client.get(`/api/disputes/user/${userId}`);
  return data.disputes || [];
}

export async function getDisputeDetail(disputeId: string): Promise<DisputeRecord> {
  const { data } = await client.get(`/api/dispute/${disputeId}`);
  return data;
}

export async function finalizeDispute(params: {
  disputeId: string;
  userId: string;
}): Promise<DisputeResolution> {
  const { data } = await client.post(`/api/dispute/${params.disputeId}/finalize`, {
    user_id: params.userId,
  });
  return data;
}

export async function getBookingDisputes(bookingId: string): Promise<DisputeRecord[]> {
  const { data } = await client.get(`/api/disputes/booking/${bookingId}`);
  return data.disputes || [];
}

export interface WorkerDisputesResponse {
  user_id: string;
  provider_id: string | null;
  disputes: DisputeRecord[];
  count: number;
}

export async function getWorkerDisputes(
  userId: string,
  status?: string
): Promise<WorkerDisputesResponse> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const { data } = await client.get(`/api/disputes/worker/${userId}`, { params });
  return data;
}

export async function respondToDispute(params: {
  disputeId: string;
  userId: string;
  message: string;
}): Promise<{
  dispute_id: string;
  dispute_status: string;
  booking_id: string;
  worker_response: DisputeWorkerResponse;
  message: string;
  dispute?: DisputeRecord;
  hifazat_summary?: {
    recommended_action?: string;
    complaint_verdict?: string;
    trust_score?: number;
  };
  worker_warning?: string | null;
}> {
  const { data } = await client.post(`/api/dispute/${params.disputeId}/respond`, {
    user_id: params.userId,
    message: params.message,
  });
  return data;
}

export async function getBookingStatus(id: string): Promise<BookingStatus> {
  const { data } = await client.get(`/api/booking/${id}`);
  return data;
}

export interface DisputeEligibilityResponse {
  booking_id: string;
  eligible: boolean;
  reason: string;
  message: string;
  booking_status: string;
  would_auto_cancel: boolean;
  no_show_grace_hours: number;
}

export async function getDisputeEligibility(bookingId: string): Promise<DisputeEligibilityResponse> {
  const { data } = await client.get(`/api/booking/${bookingId}/dispute-eligibility`);
  return data;
}

export interface RecentLogsEntry {
  request_id: string;
  user_input: string;
  timestamp: string;
  user_id: string;
  log_count: number;
  logs: AgentLog[];
}

export interface RecentLogsResponse {
  requests: RecentLogsEntry[];
  count: number;
  source: string;
}

export interface AgentLogsResponse {
  request_id: string;
  user_input?: string;
  timestamp?: string;
  user_id?: string;
  logs: AgentLog[];
  log_count?: number;
  source?: string;
  message?: string;
}

export async function getAgentLogs(requestId: string): Promise<AgentLog[]> {
  const data = await getAgentLogsDetail(requestId);
  return data.logs || [];
}

export async function getRecentAgentLogs(limit = 20): Promise<RecentLogsResponse> {
  const { data } = await client.get('/api/logs/recent', { params: { limit } });
  return data;
}

export async function getAgentLogsDetail(requestId: string): Promise<AgentLogsResponse> {
  const { data } = await client.get(`/api/logs/${requestId}`);
  return data;
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

export async function syncUserProfile(body: {
  user_id: string;
  email: string;
  role: string;
  username?: string;
  phone?: string;
  cnic?: string;
  city?: string;
  push_token?: string;
  provider_id?: string;
  skills?: string[];
  areas?: string[];
  availability?: boolean;
  rating?: number;
  price_per_service?: number;
  experience_years?: number;
  worker_data?: Record<string, unknown>;
}): Promise<{ profile_complete: boolean; user_id: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await client.post('/api/users/sync', body);
      return {
        profile_complete: Boolean(data.profile_complete),
        user_id: data.user_id || body.user_id,
      };
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && axios.isAxiosError(err) && (!err.response || err.response.status >= 500)) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function getUserProfile(
  userId: string,
  timeoutMs = 45000
): Promise<UserProfile | null> {
  try {
    const { data } = await client.get(`/api/users/${userId}`, {
      timeout: timeoutMs,
      // If caller passed a short timeout (bootstrap path), skip retries.
      ...(timeoutMs < 45000 ? { _noRetry: true } as Record<string, unknown> : {}),
    });
    return data;
  } catch {
    return null;
  }
}

export async function getUserBookings(userId: string): Promise<UserBooking[]> {
  const { data } = await client.get(`/api/bookings/user/${userId}`);
  return data.bookings || [];
}

export interface WorkerBookingsResponse {
  user_id: string;
  provider_id: string | null;
  bookings: UserBooking[];
  count: number;
  message?: string;
}

export interface WorkerEarningsSummary {
  user_id?: string;
  provider_id?: string | null;
  today_total: number;
  today_jobs: number;
  week_total: number;
  week_jobs: number;
  week_by_day: number[];
  completed_count: number;
  recent_payments: {
    booking_id?: string;
    label: string;
    amount: number;
    received: boolean;
  }[];
}

export async function getWorkerBookings(
  userId: string,
  status?: string
): Promise<WorkerBookingsResponse> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const { data } = await client.get(`/api/bookings/worker/${userId}`, { params });
  return data;
}

export async function getWorkerEarnings(userId: string): Promise<WorkerEarningsSummary> {
  const { data } = await client.get(`/api/workers/${userId}/earnings`);
  return data;
}

export async function updateBookingStatus(
  bookingId: string,
  status: string
): Promise<BookingStatus> {
  const { data } = await client.patch(`/api/booking/${bookingId}/status`, { status });
  return data;
}

/** Require Firebase UID — never use mock ids in API calls. */
export function requireUserId(user: { id: string } | null | undefined): string {
  const id = user?.id?.trim();
  if (!id) {
    throw new Error('Login zaroori hai — Firebase account se sign in karein');
  }
  return id;
}

/**
 * Resolve Firebase UID for post-login API calls (disputes, etc.).
 * Uses AuthContext user.id first, then auth.currentUser — no login dialog.
 */
export async function resolveUserId(
  user: { id: string } | null | undefined
): Promise<string> {
  const fromContext = user?.id?.trim();
  if (fromContext) return fromContext;

  const current = auth.currentUser?.uid?.trim();
  if (current) return current;

  try {
    const fbUser = await waitForAuthUser(undefined, 4000);
    return fbUser.uid;
  } catch {
    return '';
  }
}

/** Skip alert when session is missing — caller handles silently. */
export function isLoginRelatedError(message: string): boolean {
  return message.toLowerCase().includes('login');
}

// ─── Real Marketplace Flow — Job Requests + Worker Bids ──────────────────────

export interface JobRequest {
  job_request_id: string;
  status: 'open' | 'bidding' | 'assigned' | 'expired' | 'cancelled';
  service: string;
  location: string;
  city: string;
  urgency: string;
  estimated_price: number;
  expires_at: string;
  notified_count: number;
  providers_found: number;
  message: string;
}

export interface WorkerBid {
  bid_id: string;
  job_request_id: string;
  worker_id: string;
  provider_id: string;
  provider_name: string;
  price: number;
  eta_minutes: number;
  message: string;
  rating: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  moltol_rank?: number;
  recommended?: boolean;
}

export interface AvailableJob {
  request_id: string;
  service: string;
  location: string;
  city: string;
  urgency: string;
  estimated_price: number;
  customer_name: string;
  status: string;
  created_at: string;
  expires_at: string;
  bid_count: number;
}

/** Customer: Post a job request → workers get notified */
export async function createJobRequest(params: {
  user_id: string;
  service: string;
  location: string;
  city: string;
  urgency?: string;
  description?: string;
  estimated_price?: number;
  providers?: any[];
}): Promise<JobRequest> {
  const { data } = await client.post('/api/job-requests', params);
  return data;
}

/** Customer: Poll bids for a job (call every 5s) */
export async function getJobBids(job_request_id: string): Promise<{ bids: WorkerBid[]; count: number }> {
  const { data } = await client.get(`/api/job-requests/${job_request_id}/bids`);
  return data;
}

/** Customer: Accept a specific bid → creates booking */
export async function acceptBid(
  job_request_id: string,
  bid_id: string,
  customer_id: string,
  payment_method = 'cash'
): Promise<{
  booking_id: string;
  bid: WorkerBid;
  receipt: Record<string, unknown>;
  confirmation_message: string;
  whatsapp_sent: boolean;
}> {
  const { data } = await client.post(
    `/api/job-requests/${job_request_id}/accept-bid/${bid_id}`,
    { customer_id, payment_method }
  );
  return data;
}

/** Worker: Get open jobs matching their service/city */
export async function getWorkerAvailableJobs(
  user_id: string,
  service = '',
  city = ''
): Promise<{ jobs: AvailableJob[]; count: number }> {
  const { data } = await client.get(`/api/job-requests/worker/${user_id}`, {
    params: { service, city },
  });
  return data;
}

/** Worker: Submit a bid on an open job */
export async function submitWorkerBid(
  job_request_id: string,
  bid: {
    worker_id: string;
    provider_id: string;
    provider_name: string;
    price: number;
    eta_minutes?: number;
    message?: string;
    rating?: number;
  }
): Promise<{ success: boolean; bid: WorkerBid; message: string }> {
  const { data } = await client.post(`/api/job-requests/${job_request_id}/bid`, bid);
  return data;
}

export async function rebookAfterCancellation(
  bookingId: string,
  cancelledBy: 'provider' | 'customer' = 'provider',
  reason = 'Worker ne cancel kar diya'
): Promise<{
  ok: boolean;
  cancellation_id: string;
  replacement_status: string;
  replacement_message: string;
  replacement_booking?: Record<string, unknown>;
  replacement_provider?: { id: string; name: string } | null;
  customer_message: string;
  penalty_applied: boolean;
  penalty_points: number;
}> {
  const { data } = await client.post(`/api/booking/${bookingId}/rebook`, {
    cancelled_by: cancelledBy,
    reason,
  });
  return data;
}

/** Rebook when booking doc may only exist in mobile Firestore — seeds backend then agents run. */
export async function rebookFromChat(params: {
  job_request_id: string;
  user_id: string;
  provider_id?: string;
  service?: string;
  location?: string;
  city?: string;
  price?: number;
}): Promise<{
  ok: boolean;
  replacement_status: string;
  replacement_message: string;
  replacement_booking?: Record<string, unknown>;
  replacement_provider?: { id: string; name: string } | null;
}> {
  const { data } = await client.post('/api/booking/rebook-from-chat', {
    job_request_id: params.job_request_id,
    user_id: params.user_id,
    provider_id: params.provider_id || '',
    service: params.service || 'Service',
    location: params.location || '',
    city: params.city || 'Islamabad',
    price: params.price || 1000,
    cancelled_by: 'provider',
    reason: 'Worker late — customer ne naya worker maanga',
  });
  return data;
}

export async function joinWaitlist(params: {
  userId: string;
  service: string;
  location: string;
  city?: string;
  requestedTime?: string;
  intent?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  waitlist_id: string;
  message: string;
  position: number;
  estimated_callback_minutes: number;
}> {
  const { data } = await client.post('/api/waitlist', {
    user_id: params.userId,
    service: params.service,
    location: params.location,
    city: params.city || 'Islamabad',
    requested_time: params.requestedTime || 'flexible',
    intent: params.intent || {},
  });
  return data;
}
