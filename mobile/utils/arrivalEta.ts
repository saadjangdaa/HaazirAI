import type { ChatDoc } from '../services/chatService';
import { DEFAULT_ETA_MINUTES, DEFAULT_ETA_SECONDS } from '../services/chatService';

/** Production default: 20 minutes — re-export for convenience */
export { DEFAULT_ETA_MINUTES, DEFAULT_ETA_SECONDS };

export interface EtaState {
  remainingMs: number;
  minutesLeft: number;
  secondsLeft: number;
  isOverdue: boolean;
  deadline: Date | null;
  useSeconds: boolean;
}

function etaDurationMs(chat: ChatDoc): number {
  if (chat.eta_seconds != null) return chat.eta_seconds * 1000;
  if (chat.eta_minutes != null) return chat.eta_minutes * 60 * 1000;
  if (DEFAULT_ETA_SECONDS < 120) return DEFAULT_ETA_SECONDS * 1000;
  return DEFAULT_ETA_MINUTES * 60 * 1000;
}

export function getEtaState(chat: ChatDoc | null): EtaState | null {
  if (!chat || chat.status !== 'on_the_way' || !chat.on_the_way_at) return null;

  const start = new Date(chat.on_the_way_at).getTime();
  if (Number.isNaN(start)) return null;

  const useSeconds = chat.eta_seconds != null || DEFAULT_ETA_SECONDS < 120;
  const deadline = new Date(start + etaDurationMs(chat));
  const remainingMs = deadline.getTime() - Date.now();

  return {
    remainingMs,
    minutesLeft: Math.max(0, Math.ceil(remainingMs / 60000)),
    secondsLeft: Math.max(0, Math.ceil(remainingMs / 1000)),
    isOverdue: remainingMs <= 0,
    deadline,
    useSeconds,
  };
}

export function formatEtaCountdown(state: EtaState): string {
  if (!state.isOverdue) {
    if (state.useSeconds) {
      if (state.secondsLeft <= 1) return '1 second ke andar pahunch jaenge';
      return `${state.secondsLeft} second mein pahunch jaenge`;
    }
    if (state.minutesLeft <= 1) return '1 minute ke andar pahunch jaenge';
    return `${state.minutesLeft} minute mein pahunch jaenge`;
  }
  if (state.useSeconds) {
    const overdueSec = Math.ceil(Math.abs(state.remainingMs) / 1000);
    if (overdueSec <= 5) return 'Expected time guzar chuka hai';
    return `${overdueSec} second late ho chuke hain`;
  }
  const overdueMin = Math.ceil(Math.abs(state.remainingMs) / 60000);
  if (overdueMin <= 1) return 'Expected time guzar chuka hai';
  return `${overdueMin} minute late ho chuke hain`;
}
