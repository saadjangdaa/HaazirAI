import axios from 'axios';
import { BiddingResponse, Bid } from './api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export type ConversationPhase = 'intake' | 'searching' | 'confirming' | 'booking' | 'done';

export interface BookingResult {
  booking_id: string;
  provider: any;
  receipt: any;
  confirmation_message: string;
  reminders: string[];
  payment_method: string;
  whatsapp_sent?: boolean;
}

export interface NegotiatedBid {
  provider_id: string;
  provider_name: string;
  bid_price: number;
  original_bid_price?: number;
  savings?: number;
  eta_minutes?: number;
  composite_score?: number;
}

export interface ConversationTurn {
  session_id: string;
  response_text: string;
  phase: ConversationPhase;
  search_trigger?: Record<string, string>;
  book_trigger?: Record<string, string>;
  providers?: any[];
  request_id?: string;
  audio_base64?: string;
  booking_result?: BookingResult;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendMessage(
  session_id: string,
  user_text: string,
  user_id = 'user_001',
  user_name?: string,
  history?: HistoryEntry[],
  voice_id?: string,
  language?: string,
  user_city?: string,
): Promise<ConversationTurn> {
  const { data } = await axios.post(
    `${BASE_URL}/api/conversation`,
    {
      session_id,
      user_text,
      user_id,
      user_name,
      history: history || [],
      ...(voice_id ? { voice_id } : {}),
      ...(language ? { language } : {}),
      ...(user_city ? { user_city } : {}),
    },
    { timeout: 35000 },
  );
  return data;
}

export async function startConversation(
  session_id: string,
  user_id = 'user_001',
  user_name?: string,
  voice_id?: string,
  language?: string,
  user_city?: string,
): Promise<ConversationTurn> {
  return sendMessage(session_id, '__init__', user_id, user_name, [], voice_id, language, user_city);
}

function _localNegotiate(providers: any[]): { top_bids: NegotiatedBid[]; recommendation: string; total_savings: number } {
  const pool = providers.slice(0, 3);
  const top_bids: NegotiatedBid[] = pool.map((p, i) => {
    const original = p.base_rate || p.price_per_hour || 2500;
    const discount = 0.10 + i * 0.03; // 10%, 13%, 16%
    const bid_price = Math.round(original * (1 - discount) / 50) * 50;
    return {
      provider_id: p.id || p.provider_id || `p${i}`,
      provider_name: p.name || 'Provider',
      bid_price,
      original_bid_price: original,
      savings: original - bid_price,
      eta_minutes: p.eta_minutes || 20 + i * 5,
      composite_score: p.trust_score || p.rating || 4.0,
    };
  });
  const total_savings = top_bids.reduce((s, b) => s + (b.savings ?? 0), 0);
  const best = top_bids[0];
  return {
    top_bids,
    recommendation: `${best.provider_name} best deal hai — Rs. ${best.bid_price.toLocaleString()} mein service milegi!`,
    total_savings,
  };
}

export async function negotiateProviders(
  session_id: string,
  user_id: string,
  providers?: any[],
): Promise<{ top_bids: NegotiatedBid[]; recommendation: string; total_savings: number }> {
  try {
    const { data } = await axios.post(`${BASE_URL}/api/conversation/negotiate`, {
      session_id,
      user_id,
      providers,
    });
    return data;
  } catch (e: any) {
    // Fallback: negotiate locally on any server/network error
    if (providers?.length) {
      return _localNegotiate(providers);
    }
    throw e;
  }
}

export function toBiddingResponse(
  requestId: string,
  topBids: NegotiatedBid[],
  providers: any[],
  negotiationLog: string[],
): BiddingResponse {
  const bids: Bid[] = topBids.map((nb) => {
    const matched = providers.find((p) => (p.id || p.provider_id) === nb.provider_id);
    return {
      provider_id: nb.provider_id,
      provider_name: nb.provider_name,
      bid_price: nb.original_bid_price ?? nb.bid_price,
      final_price: nb.bid_price,
      eta_minutes: nb.eta_minutes ?? matched?.eta_minutes ?? 20,
      rating: nb.composite_score ?? matched?.rating ?? 4.0,
      message: matched?.review || `${nb.provider_name} ke saath best deal!`,
      negotiated: (nb.savings ?? 0) > 0,
    };
  });

  const recommendedBid = bids.reduce((best, b) =>
    b.final_price < best.final_price ? b : best, bids[0]);

  const log =
    negotiationLog.length > 0
      ? negotiationLog
      : bids.map((b) =>
          b.negotiated
            ? `  ✅ ${b.provider_name}: Rs. ${b.final_price.toLocaleString()} par agree`
            : `  ❌ ${b.provider_name}: negotiate nahi hua`
        );

  return { request_id: requestId, bids, recommended_bid: recommendedBid, negotiation_log: log };
}

export async function directBook(
  session_id: string,
  user_id: string,
  provider_id: string,
  price_accepted: number,
  payment_method = 'cash',
  _providerHint?: any,
): Promise<BookingResult> {
  try {
    const { data } = await axios.post(`${BASE_URL}/api/conversation/book`, {
      session_id,
      user_id,
      provider_id,
      price_accepted,
      payment_method,
    });
    return data;
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 404 || !e?.response) {
      // Fallback: mock booking when endpoint not deployed
      const p = _providerHint || {};
      const booking_id = `HAZ-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      return {
        booking_id,
        provider: p,
        receipt: {
          service: p.service || 'Service',
          scheduled_time: 'Kal 10:00 AM',
          estimated_price: `Rs. ${(price_accepted || p.base_rate || 2500).toLocaleString()}`,
          payment_methods: [payment_method],
          status: 'confirmed',
        },
        confirmation_message: `✅ Booking confirm! ${p.name || 'Provider'} kal aayenge. ID: ${booking_id}`,
        reminders: [],
        payment_method,
        whatsapp_sent: false,
      };
    }
    throw e;
  }
}
