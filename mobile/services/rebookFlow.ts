/**
 * Customer late-rebook: close old worker chat, open new chat for replacement worker.
 */
import { formatApiError, getAllProviders, rebookFromChat, type Provider } from './api';
import {
  appendChatSystemMessage,
  closeChatForReplacedWorker,
  createRebookChat,
  type ChatDoc,
} from './chatService';

export type RebookOutcome =
  | {
      ok: true;
      workerId: string;
      workerName: string;
      source: string;
      bookingId?: string;
      newJobRequestId: string;
    }
  | { ok: false; reason: string };

function excludedIds(chat: ChatDoc): Set<string> {
  const ids = new Set<string>();
  for (const v of [chat.worker_id, chat.worker_uid, chat.worker_name]) {
    const s = (v || '').trim();
    if (s) ids.add(s);
  }
  return ids;
}

function pickProvider(candidates: Provider[], exclude: Set<string>): Provider | null {
  const filtered = candidates.filter((p) => {
    if (!p?.id) return false;
    if (exclude.has(p.id)) return false;
    if (p.name && exclude.has(p.name)) return false;
    return true;
  });
  if (!filtered.length) return null;
  return filtered.find((p) => p.available) || filtered[0];
}

async function pickFromProvidersApi(chat: ChatDoc): Promise<Provider | null> {
  const exclude = excludedIds(chat);
  const attempts: { city?: string; service?: string }[] = [
    { city: chat.city, service: chat.service },
    { city: chat.city },
    {},
  ];

  for (const params of attempts) {
    try {
      const list = await getAllProviders(params.city, params.service);
      const pick = pickProvider(list, exclude);
      if (pick) return pick;
    } catch {
      /* try broader search */
    }
  }
  return null;
}

async function pickFromPakkaAgents(
  chat: ChatDoc,
): Promise<{ id: string; name: string; bookingId?: string } | null> {
  const bookingId = chat.booking_id || chat.job_request_id;
  try {
    const res = await rebookFromChat({
      job_request_id: chat.job_request_id,
      user_id: chat.customer_id,
      provider_id: chat.worker_id || chat.worker_uid || '',
      service: chat.service,
      location: chat.location,
      city: chat.city,
      price: chat.estimated_price || 1000,
    });

    if (res.replacement_status !== 'replacement_found') {
      return null;
    }

    const rb = res.replacement_booking as Record<string, unknown> | undefined;
    const id =
      res.replacement_provider?.id ||
      (rb?.provider_id as string | undefined) ||
      '';
    const name =
      res.replacement_provider?.name ||
      ((rb?.receipt as Record<string, unknown> | undefined)?.provider_name as string) ||
      '';

    if (!id || excludedIds(chat).has(id)) return null;
    return {
      id,
      name: name || 'Worker',
      bookingId: (rb?.booking_id as string | undefined) || bookingId,
    };
  } catch {
    return null;
  }
}

export async function findReplacementWorker(chat: ChatDoc): Promise<RebookOutcome> {
  const fromAgents = await pickFromPakkaAgents(chat);
  if (fromAgents) {
    return {
      ok: true,
      workerId: fromAgents.id,
      workerName: fromAgents.name,
      source: 'pakka_agents',
      bookingId: fromAgents.bookingId,
      newJobRequestId: '',
    };
  }

  const fromList = await pickFromProvidersApi(chat);
  if (fromList) {
    return {
      ok: true,
      workerId: fromList.id,
      workerName: fromList.name,
      source: 'providers_api',
      bookingId: chat.booking_id || chat.job_request_id,
      newJobRequestId: '',
    };
  }

  return {
    ok: false,
    reason:
      'Is service / city mein abhi koi doosra worker available nahi mila. ' +
      'Thori der baad retry karein ya Nearby Workers se manually book karein.',
  };
}

export async function runCustomerRebook(params: {
  chat: ChatDoc;
  jobRequestId: string;
  customerName: string;
}): Promise<RebookOutcome> {
  const { chat, jobRequestId, customerName } = params;
  const oldWorker = chat.worker_name || 'Worker';

  // Close old thread first — old worker never sees search / new-worker messages
  await closeChatForReplacedWorker(jobRequestId, customerName, oldWorker);

  let outcome: RebookOutcome;
  try {
    outcome = await findReplacementWorker(chat);
  } catch (err) {
    outcome = {
      ok: false,
      reason: formatApiError(err) || 'Worker search fail ho gayi — network check karein.',
    };
  }

  if (!outcome.ok) {
    return outcome;
  }

  const newJobRequestId = await createRebookChat({
    parentChat: chat,
    newWorkerId: outcome.workerId,
    newWorkerName: outcome.workerName,
    newBookingId: outcome.bookingId,
  });

  await appendChatSystemMessage(
    newJobRequestId,
    `🔄 ${customerName} ne naya worker choose kiya (${oldWorker} cancel). Request bhej di gayi.`,
  );
  await appendChatSystemMessage(
    newJobRequestId,
    `✅ Naya worker: ${outcome.workerName}. Jab accept karega tab kaam shuru hoga.`,
  );

  return {
    ...outcome,
    newJobRequestId,
  };
}
