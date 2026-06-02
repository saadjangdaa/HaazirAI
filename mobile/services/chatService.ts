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

export type CustomerWaitDecision = 'waiting' | 'rebook';

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
  booking_id?: string;
  /** Set when worker taps Rawaana — used for ETA countdown */
  on_the_way_at?: string;
  eta_minutes?: number;
  /** Testing / short ETA — seconds until expected arrival */
  eta_seconds?: number;
  /** When late-arrival prompts were injected into chat */
  late_prompt_at?: string;
  late_worker_note?: string;
  customer_wait_decision?: CustomerWaitDecision | null;
  /** Old worker chat closed — replaced by superseded_by */
  superseded_by?: string;
  /** New worker name after rebook (for customer redirect from old chat) */
  superseded_worker_name?: string;
  parent_job_request_id?: string;
  /** Worker UI: only show messages[0..worker_message_cutoff) */
  worker_message_cutoff?: number;
}

export const DEFAULT_ETA_MINUTES = 20;
/** Testing: 30 sec countdown. Production: remove eta_seconds and use eta_minutes only */
export const DEFAULT_ETA_SECONDS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function mkId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function sysMsg(text: string): ChatMessage {
  return { id: mkId(), sender_role: 'system', sender_name: 'Haazir AI', text, ts: nowIso() };
}

const WORKER_REBOOK_CLOSE_PATTERNS = [
  'naya worker maanga',
  'booking cancel ho gayi',
  'booking cancel.',
  'ab koi kaam nahi',
  'ki booking cancel ho gayi',
];

/** Active replacement thread — new worker from agent rebook (not the cancelled old job). */
export function isRebookReplacementChat(chat: ChatDoc | null): boolean {
  if (!chat) return false;
  if (chat.parent_job_request_id) return true;
  return (chat.job_request_id || '').includes('_rb_');
}

function workerRebookCloseIndex(chat: ChatDoc): number | null {
  if (isRebookReplacementChat(chat)) return null;
  if (chat.worker_message_cutoff != null && chat.worker_message_cutoff > 0) {
    return chat.worker_message_cutoff;
  }
  const msgs = chat.messages || [];
  let last = -1;
  for (let i = 0; i < msgs.length; i++) {
    const t = (msgs[i].text || '').toLowerCase();
    if (WORKER_REBOOK_CLOSE_PATTERNS.some((p) => t.includes(p))) last = i;
    // Legacy close line from closeChatForReplacedWorker
    if (t.includes('naya worker choose kiya') && t.includes('ab koi kaam nahi')) last = i;
  }
  return last >= 0 ? last + 1 : null;
}

/** Old worker after rebook — hide customer/new-worker messages. */
export function messagesForWorkerView(chat: ChatDoc | null): ChatMessage[] {
  if (!chat?.messages?.length) return [];
  if (isRebookReplacementChat(chat)) return chat.messages;
  const cutoff = workerRebookCloseIndex(chat);
  if (cutoff != null) return chat.messages.slice(0, cutoff);
  return chat.messages;
}

export function isWorkerChatClosedAfterRebook(chat: ChatDoc | null): boolean {
  if (!chat || isRebookReplacementChat(chat)) return false;
  if (chat.superseded_by) return true;
  if (chat.customer_wait_decision === 'rebook') return true;
  if (chat.worker_message_cutoff != null) return true;
  if (workerRebookCloseIndex(chat) != null) return true;
  return false;
}

/** Append a single system line (rebook progress, errors). */
export async function appendChatSystemMessage(jobRequestId: string, text: string): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  await updateDoc(ref, {
    updated_at: nowIso(),
    messages: arrayUnion(sysMsg(text)),
  });
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

  // Update booking status to 'confirmed' when worker accepts.
  // The booking doc was created (status='assigned') when customer sent the request.
  // Use job_request_id as the booking_id (consistent with nearby.tsx).
  if (customerId) {
    const bookingRef = doc(db, 'bookings', jobRequestId);
    const bookingSnap = await getDoc(bookingRef);
    if (bookingSnap.exists()) {
      // Update existing booking (created by customer when they sent the request)
      await updateDoc(bookingRef, {
        status: 'confirmed',
        provider_name: workerName,
        provider_uid: workerId,
        updated_at: now,
      });
    } else {
      // Fallback: create booking if it doesn't exist yet
      await setDoc(bookingRef, {
        booking_id: jobRequestId,
        job_request_id: jobRequestId,
        user_id: customerId,
        provider_id: chatSource?.worker_id || null,
        provider_uid: workerId,
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
}

/** Worker updates status (on the way, arrived, etc.) */
export async function workerUpdateStatus(
  jobRequestId: string,
  workerName: string,
  status: ChatStatus,
  bookingId?: string,
): Promise<void> {
  const STATUS_MSG: Partial<Record<ChatStatus, string>> = {
    on_the_way:  `${workerName} rawaana ho gaye — ${DEFAULT_ETA_SECONDS} second mein pahunch jaenge!`,
    arrived:     `${workerName} pahunch gaye! Darwaza khol dein.`,
    in_progress: 'Kaam shuru ho gaya.',
    completed:   'Kaam mukammal ho gaya! Shukriya.',
  };
  const chatRef = doc(db, 'chats', jobRequestId);
  const now = nowIso();
  const updates: Record<string, unknown> = { status, updated_at: now };
  if (bookingId) updates.booking_id = bookingId;
  if (status === 'on_the_way') {
    updates.on_the_way_at = now;
    updates.eta_seconds = DEFAULT_ETA_SECONDS;
    updates.eta_minutes = null;
    updates.late_prompt_at = null;
    updates.late_worker_note = null;
    updates.customer_wait_decision = null;
  }
  if (status === 'arrived' || status === 'completed' || status === 'cancelled') {
    updates.on_the_way_at = null;
  }
  const msg = STATUS_MSG[status];
  if (msg) updates.messages = arrayUnion(sysMsg(msg));
  await updateDoc(chatRef, updates);

  // Sync booking status in Firestore so customer's Meri Bookings stays up to date
  const BOOKING_STATUS: Partial<Record<ChatStatus, string>> = {
    on_the_way:  'on_the_way',
    arrived:     'arrived',
    in_progress: 'in_progress',
    completed:   'completed',
    cancelled:   'cancelled',
  };
  const bookingStatus = BOOKING_STATUS[status];
  if (bookingStatus) {
    const bRef = doc(db, 'bookings', bookingId || jobRequestId);
    updateDoc(bRef, { status: bookingStatus, updated_at: nowIso() }).catch(() => {});
  }
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

/** Inject late-arrival prompts once ETA expires (idempotent). */
export async function triggerLateArrivalPrompts(
  jobRequestId: string,
  workerName: string,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as ChatDoc;
  if (data.late_prompt_at || data.status !== 'on_the_way') return;

  const now = nowIso();
  await updateDoc(ref, {
    late_prompt_at: now,
    updated_at: now,
    messages: arrayUnion(
      sysMsg(`⏰ ${workerName} ko expected time ho chuka hai.`),
      sysMsg('Worker: der ki wajah ya kitni der aur lagay gi batayein.'),
      sysMsg('Customer: intezaar karein ya naya worker dhundhein — neeche choose karein.'),
    ),
  });
}

/** Worker explains delay after ETA expired. */
export async function workerSubmitLateNote(
  jobRequestId: string,
  workerName: string,
  note: string,
): Promise<void> {
  const text = note.trim();
  if (!text) return;
  const ref = doc(db, 'chats', jobRequestId);
  await updateDoc(ref, {
    late_worker_note: text,
    updated_at: nowIso(),
    messages: arrayUnion(
      {
        id: mkId(),
        sender_role: 'worker',
        sender_name: workerName,
        text: `Der ho gayi — ${text}`,
        ts: nowIso(),
      },
      sysMsg(`${workerName} ne bataya: ${text}`),
    ),
  });
}

/** Customer chooses to wait or request a new worker. */
export async function customerSetWaitDecision(
  jobRequestId: string,
  customerName: string,
  decision: CustomerWaitDecision,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  const now = nowIso();

  if (decision === 'waiting') {
    await updateDoc(ref, {
      customer_wait_decision: 'waiting',
      updated_at: now,
      messages: arrayUnion(
        sysMsg(`✅ ${customerName} ne intezaar karne ka faisla kiya — worker ab bhi aa sakta hai.`),
      ),
    });
    return;
  }

  await updateDoc(ref, {
    customer_wait_decision: 'rebook',
    status: 'cancelled',
    updated_at: now,
    messages: arrayUnion(
      sysMsg(`❌ ${customerName} ne naya worker maanga — purani booking cancel ho rahi hai.`),
      sysMsg('Haazir AI aap ke liye naya worker dhundh raha hai...'),
    ),
  });

  const snap = await getDoc(ref);
  const bookingId = (snap.data() as ChatDoc | undefined)?.booking_id || jobRequestId;
  updateDoc(doc(db, 'bookings', bookingId), { status: 'cancelled', updated_at: now }).catch(() => {});
}

/** Close original worker's chat — no new-worker messages on this thread. */
export async function closeChatForReplacedWorker(
  jobRequestId: string,
  customerName: string,
  oldWorkerName: string,
): Promise<void> {
  const ref = doc(db, 'chats', jobRequestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const chat = snap.data() as ChatDoc;
  const priorCount = (chat.messages || []).length;
  const now = nowIso();
  const bookingId = chat.booking_id || jobRequestId;

  await updateDoc(ref, {
    status: 'cancelled',
    customer_wait_decision: 'rebook',
    on_the_way_at: null,
    eta_seconds: null,
    eta_minutes: null,
    late_prompt_at: null,
    updated_at: now,
    worker_message_cutoff: priorCount + 1,
    messages: arrayUnion(
      sysMsg(
        `❌ ${customerName} ne naya worker choose kiya. ${oldWorkerName} ki booking cancel ho gayi — ab koi kaam nahi.`,
      ),
    ),
  });

  updateDoc(doc(db, 'bookings', bookingId), { status: 'cancelled', updated_at: now }).catch(() => {});
}

/** New chat doc for replacement worker — customer waiting screen, fresh thread. */
export async function createRebookChat(params: {
  parentChat: ChatDoc;
  newWorkerId: string;
  newWorkerName: string;
  newBookingId?: string;
}): Promise<string> {
  const { parentChat, newWorkerId, newWorkerName, newBookingId } = params;
  const parentId = parentChat.job_request_id;
  const newJobRequestId = `${parentId}_rb_${mkId().slice(-8)}`;
  const now = nowIso();
  const bookingId = newBookingId || newJobRequestId;

  await createChat({
    job_request_id: newJobRequestId,
    customer_id: parentChat.customer_id,
    customer_name: parentChat.customer_name,
    worker_id: newWorkerId,
    worker_name: newWorkerName,
    service: parentChat.service,
    location: parentChat.location,
    city: parentChat.city,
    urgency: parentChat.urgency,
    estimated_price: parentChat.estimated_price,
  });

  await updateDoc(doc(db, 'chats', newJobRequestId), {
    parent_job_request_id: parentId,
    booking_id: bookingId,
    updated_at: now,
  });

  await updateDoc(doc(db, 'chats', parentId), {
    superseded_by: newJobRequestId,
    superseded_worker_name: newWorkerName,
    updated_at: now,
  });

  await setDoc(
    doc(db, 'bookings', bookingId),
    {
      booking_id: bookingId,
      job_request_id: newJobRequestId,
      user_id: parentChat.customer_id,
      provider_id: newWorkerId,
      provider_name: newWorkerName,
      service: parentChat.service,
      location: parentChat.location,
      city: parentChat.city,
      scheduled_time: now,
      price: parentChat.estimated_price || 0,
      status: 'assigned',
      created_at: now,
      updated_at: now,
      tracking_steps: [],
      replaced_from: parentId,
    },
    { merge: true },
  );

  const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  await saveJobRequestToFirestore({
    job_request_id: newJobRequestId,
    customer_id: parentChat.customer_id,
    customer_name: parentChat.customer_name,
    service: parentChat.service,
    location: parentChat.location,
    city: parentChat.city,
    urgency: parentChat.urgency || 'medium',
    description: `Rebook after ${parentId}`,
    estimated_price: parentChat.estimated_price || 0,
    expires_at: expires,
    notified_provider_ids: [newWorkerId],
  });

  return newJobRequestId;
}

/** @deprecated Use closeChatForReplacedWorker + createRebookChat */
export async function applyRebookToChat(params: {
  jobRequestId: string;
  customerName: string;
  oldWorkerName: string;
  newWorkerId: string;
  newWorkerName: string;
  newBookingId?: string;
}): Promise<string> {
  await closeChatForReplacedWorker(params.jobRequestId, params.customerName, params.oldWorkerName);
  const snap = await getDoc(doc(db, 'chats', params.jobRequestId));
  const parent = snap.data() as ChatDoc;
  return createRebookChat({
    parentChat: parent,
    newWorkerId: params.newWorkerId,
    newWorkerName: params.newWorkerName,
    newBookingId: params.newBookingId,
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
