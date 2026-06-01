/**
 * Firestore real-time chat for job requests.
 * Collection: chats/{jobRequestId}
 * Each document holds the chat status + messages array (max 100).
 */
import { db } from './firebase';
import {
  doc, setDoc, updateDoc, onSnapshot, arrayUnion, getDoc,
} from 'firebase/firestore';

export type ChatStatus =
  | 'waiting'     // customer sent request, waiting for worker
  | 'accepted'    // worker accepted
  | 'on_the_way'  // worker confirmed they're coming
  | 'arrived'     // worker arrived
  | 'in_progress' // work started
  | 'completed'   // job done
  | 'cancelled';

export interface ChatMessage {
  id: string;
  sender_role: 'customer' | 'worker' | 'system';
  sender_name: string;
  text: string;
  ts: string;
}

export interface ChatDoc {
  job_request_id: string;
  customer_id: string;
  customer_name: string;
  worker_id: string | null;   // provider_id of the targeted worker (e.g. "p027")
  worker_uid: string | null;  // Firebase UID of the worker (set after accept)
  worker_name: string;
  service: string;
  location: string;
  city: string;
  urgency: string;
  estimated_price: number;
  status: ChatStatus;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mkId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function sysMsg(text: string): ChatMessage {
  return { id: mkId(), sender_role: 'system', sender_name: 'Haazir AI', text, ts: nowIso() };
}

/** Create a new chat when customer sends a job request */
export async function createChat(params: {
  job_request_id: string;
  customer_id: string;
  customer_name: string;
  worker_id: string;        // provider_id e.g. "p027"
  worker_name: string;
  service: string;
  location: string;
  city: string;
  urgency?: string;
  estimated_price?: number;
}): Promise<void> {
  const data: ChatDoc = {
    job_request_id: params.job_request_id,
    customer_id: params.customer_id,
    customer_name: params.customer_name,
    worker_id: params.worker_id || null,
    worker_uid: null,
    worker_name: params.worker_name,
    service: params.service,
    location: params.location,
    city: params.city,
    urgency: params.urgency || 'medium',
    estimated_price: params.estimated_price || 0,
    status: 'waiting',
    messages: [
      sysMsg(`Request ${params.worker_name} ko bhej di gayi. Unka jawab aa rha hai...`),
    ],
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await setDoc(doc(db, 'chats', params.job_request_id), data);
}

/** Worker accepts the job — updates status + adds messages */
export async function workerAcceptJob(
  jobRequestId: string,
  workerId: string,
  workerName: string,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  await updateDoc(ref, {
    worker_uid: workerId,   // actual Firebase UID of the accepting worker
    status: 'accepted',
    updated_at: nowIso(),
    messages: arrayUnion(
      sysMsg(`✅ ${workerName} ne kaam accept kar liya!`),
      {
        id: mkId(),
        sender_role: 'worker',
        sender_name: workerName,
        text: 'Assalam o Alaikum! May thodi der mein pahunch raha hon. Apna address ready rakhein.',
        ts: nowIso(),
      },
    ),
  });
}

/** Worker updates status (on the way, arrived, etc.) */
export async function workerUpdateStatus(
  jobRequestId: string,
  workerName: string,
  status: ChatStatus,
): Promise<void> {
  const STATUS_MSG: Partial<Record<ChatStatus, string>> = {
    on_the_way:  `${workerName} rawaana ho gaye — thodi der mein pahunch jaenge!`,
    arrived:     `${workerName} pahunch gaye! Darwaza khol dein.`,
    in_progress: 'Kaam shuru ho gaya.',
    completed:   'Kaam mukammal ho gaya! Shukriya.',
  };
  const ref = doc(db, 'chats', jobRequestId);
  const updates: Record<string, unknown> = { status, updated_at: nowIso() };
  const msg = STATUS_MSG[status];
  if (msg) updates.messages = arrayUnion(sysMsg(msg));
  await updateDoc(ref, updates);
}

/** Send a text message (customer or worker) */
export async function sendChatMessage(
  jobRequestId: string,
  sender_role: 'customer' | 'worker',
  sender_name: string,
  text: string,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  await updateDoc(ref, {
    updated_at: nowIso(),
    messages: arrayUnion({ id: mkId(), sender_role, sender_name, text, ts: nowIso() }),
  });
}

/** Real-time listener — returns unsubscribe function */
export function subscribeToChat(
  jobRequestId: string,
  callback: (chat: ChatDoc | null) => void,
): () => void {
  const ref = doc(db, 'chats', jobRequestId);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? (snap.data() as ChatDoc) : null);
  });
}

export async function getChat(jobRequestId: string): Promise<ChatDoc | null> {
  const snap = await getDoc(doc(db, 'chats', jobRequestId));
  return snap.exists() ? (snap.data() as ChatDoc) : null;
}

/**
 * Write job_request directly to Firestore from mobile.
 * This is the source of truth for the worker's real-time Available Jobs listener,
 * since the backend may be in mock mode (no real Firestore writes from server).
 */
export async function saveJobRequestToFirestore(params: {
  job_request_id: string;
  customer_id: string;
  customer_name: string;
  service: string;
  location: string;
  city: string;
  urgency: string;
  description: string;
  estimated_price: number;
  expires_at: string;
}): Promise<void> {
  const now = nowIso();
  await setDoc(doc(db, 'job_requests', params.job_request_id), {
    request_id: params.job_request_id,
    customer_id: params.customer_id,
    customer_name: params.customer_name,
    service: params.service,
    location: params.location,
    city: params.city,
    urgency: params.urgency,
    description: params.description,
    estimated_price: params.estimated_price,
    status: 'open',
    bid_count: 0,
    created_at: now,
    expires_at: params.expires_at || new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    notified_provider_ids: [],
  });
}
