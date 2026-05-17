import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export type ConversationPhase = 'intake' | 'searching' | 'confirming' | 'booking' | 'done';

export interface BookingResult {
  booking_id: string;
  provider: any;
  receipt: any;
  confirmation_message: string;
  reminders: string[];
  payment_method: string;
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

export async function sendMessage(
  session_id: string,
  user_text: string,
  user_id = 'user_001',
  user_name?: string,
): Promise<ConversationTurn> {
  const { data } = await axios.post(`${BASE_URL}/api/conversation`, {
    session_id,
    user_text,
    user_id,
    user_name,
  });
  return data;
}

export async function startConversation(
  session_id: string,
  user_id = 'user_001',
  user_name?: string,
): Promise<ConversationTurn> {
  return sendMessage(session_id, '__init__', user_id, user_name);
}
