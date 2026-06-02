/**
 * Firestore real-time chat for job requests.
 * Collection: chats/{jobRequestId}
 * Each document holds the chat status + messages array (max 100).
 */
import { db } from './firebase';
import {
  doc, setDoc, updateDoc, onSnapshot, arrayUnion, getDoc,
  collection, query, where, limit,
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

/** Worker accepts the job — updates existing chat or creates one for marketplace jobs */
export async function workerAcceptJob(
  jobRequestId: string,
  workerId: string,
  workerName: string,
  jobData?: {
    customer_id?: string;
    customer_name?: string;
    service?: string;
    location?: string;
    city?: string;
    urgency?: string;
    estimated_price?: number;
  },
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  const snap = await getDoc(ref);
  const now = nowIso();
  const acceptMsgs = [
    sysMsg(`✅ ${workerName} ne kaam accept kar liya!`),
    {
      id: mkId(),
      sender_role: 'worker' as const,
      sender_name: workerName,
      text: 'Assalam o Alaikum! May thodi der mein pahunch raha hon. Apna address ready rakhein.',
      ts: now,
    },
  ];

  const chatSource = snap.exists() ? (snap.data() as ChatDoc) : null;
  const customerId = chatSource?.customer_id || jobData?.customer_id || '';
  const service = chatSource?.service || jobData?.service || 'Service';
  const estimatedPrice = chatSource?.estimated_price ?? jobData?.estimated_price ?? 0;

  if (snap.exists()) {
    await updateDoc(ref, {
      worker_uid: workerId,
      worker_name: workerName,
      status: 'accepted',
      updated_at: now,
      messages: arrayUnion(...acceptMsgs),
    });
  } else {
    // Marketplace job — no chat doc yet, create one
    await setDoc(ref, {
      job_request_id: jobRequestId,
      customer_id: customerId,
      customer_name: jobData?.customer_name || 'Customer',
      worker_id: null,
      worker_uid: workerId,
      worker_name: workerName,
      service,
      location: jobData?.location || '',
      city: jobData?.city || '',
      urgency: jobData?.urgency || 'medium',
      estimated_price: estimatedPrice,
      status: 'accepted',
      messages: acceptMsgs,
      created_at: now,
      updated_at: now,
    });
  }

  // Create a bookings/{bookingId} document so customer's Meri Bookings shows this job
  if (customerId) {
    const bookingId = `HAZ-${jobRequestId.slice(-8).toUpperCase()}`;
    await setDoc(doc(db, 'bookings', bookingId), {
      booking_id: bookingId,
      job_request_id: jobRequestId,
      user_id: customerId,
      provider_id: chatSource?.worker_id || null,
      provider_name: workerName,
      service,
      scheduled_time: now,
      price: estimatedPrice,
      status: 'confirmed',
      created_at: now,
      updated_at: now,
      tracking_steps: [],
    });
  }
}

/** Worker updates status (on the way, arrived, etc.) */
export async function workerUpdateStatus(
  jobRequestId: string,
  workerName: string,
  status: ChatStatus,
  bookingId?: string,
): Promise<void> {
  const STATUS_MSG: Partial<Record<ChatStatus, string>> = {
    on_the_way:  `${workerName} rawaana ho gaye — thodi der mein pahunch jaenge!`,
    arrived:     `${workerName} pahunch gaye! Darwaza khol dein.`,
    in_progress: 'Kaam shuru ho gaya.',
    completed:   'Kaam mukammal ho gaya! Shukriya.',
  };
  const ref = doc(db, 'chats', jobRequestId);
  const updates: Record<string, unknown> = { status, updated_at: nowIso() };
  if (bookingId) updates.booking_id = bookingId;
  const msg = STATUS_MSG[status];
  if (msg) updates.messages = arrayUnion(sysMsg(msg));
  await updateDoc(ref, updates);
}

/** Worker cancels an accepted job before arriving at customer */
export async function workerCancelJob(
  jobRequestId: string,
  workerName: string,
  reason?: string,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  const cancelMsg = sysMsg(
    reason
      ? `❌ ${workerName} ne kaam cancel kar diya. Wajah: ${reason}`
      : `❌ ${workerName} ne kaam cancel kar diya. Aapko doosra worker milega.`,
  );
  await updateDoc(ref, {
    status: 'cancelled',
    updated_at: nowIso(),
    messages: arrayUnion(cancelMsg),
  });
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
  let fallbackUnsub: (() => void) | null = null;

  const unsub = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as ChatDoc);
    } else {
      // Try querying by booking_id as fallback
      const q = query(
        collection(db, 'chats'),
        where('booking_id', '==', jobRequestId),
        limit(1),
      );
      if (fallbackUnsub) fallbackUnsub();
      fallbackUnsub = onSnapshot(q, (qsnap) => {
        if (!qsnap.empty) {
          callback(qsnap.docs[0].data() as ChatDoc);
        } else {
          callback(null);
        }
      });
    }
  });

  return () => {
    unsub();
    if (fallbackUnsub) fallbackUnsub();
  };
}

export async function getChat(jobRequestId: string): Promise<ChatDoc | null> {
  const snap = await getDoc(doc(db, 'chats', jobRequestId));
  return snap.exists() ? (snap.data() as ChatDoc) : null;
}

/** Worker cancels / declines the job */
export async function cancelJob(jobRequestId: string, workerName: string): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  await updateDoc(ref, {
    status: 'cancelled',
    updated_at: nowIso(),
    messages: arrayUnion(sysMsg(`${workerName} ne yeh job decline kar di.`)),
  });
}

/** Worker sends a bid offer into the chat */
export async function sendBidOffer(
  jobRequestId: string,
  workerName: string,
  price: number,
  etaMinutes: number,
  extraMessage: string,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  const text = `Mera rate: Rs ${price.toLocaleString()}. ETA: ${etaMinutes} min.${extraMessage ? ' ' + extraMessage : ''}`;
  await updateDoc(ref, {
    updated_at: nowIso(),
    messages: arrayUnion({
      id: mkId(),
      sender_role: 'worker',
      sender_name: workerName,
      text,
      ts: nowIso(),
    }),
  });
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
  notified_provider_ids?: string[];
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
    notified_provider_ids: params.notified_provider_ids || [],
  });
}

// ── Voice session persistence ─────────────────────────────────────────────────

export interface VoiceSessionSummary {
  session_id: string;
  user_id: string;
  title: string;
  last_message: string;
  phase: string;
  service_type?: string;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface VoiceSessionDoc extends VoiceSessionSummary {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function saveVoiceSession(params: VoiceSessionDoc): Promise<void> {
  const ref = doc(db, 'voice_sessions', params.session_id);
  const snap = await getDoc(ref);
  const now = nowIso();
  if (snap.exists()) {
    await updateDoc(ref, { ...params, updated_at: now });
  } else {
    await setDoc(ref, { ...params, created_at: now, updated_at: now });
  }
}

export async function getVoiceSession(sessionId: string): Promise<VoiceSessionDoc | null> {
  const snap = await getDoc(doc(db, 'voice_sessions', sessionId));
  return snap.exists() ? (snap.data() as VoiceSessionDoc) : null;
}

export function subscribeToUserVoiceSessions(
  userId: string,
  callback: (sessions: VoiceSessionSummary[]) => void,
): () => void {
  const q = query(
    collection(db, 'voice_sessions'),
    where('user_id', '==', userId),
    limit(30),
  );
  return onSnapshot(q, (snap) => {
    const sessions = snap.docs
      .map((d) => d.data() as VoiceSessionSummary)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    callback(sessions);
  });
}
