import type { UserBooking } from '../services/api';

export const WORKER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  assigned: 'New',
  confirmed: 'Confirmed',
  on_the_way: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

export function formatWorkerPrice(amount?: number): string {
  const n = Number(amount) || 0;
  return `Rs ${n.toLocaleString('en-PK')}`;
}

export function formatWorkerTime(booking: UserBooking): string {
  const raw = booking.scheduled_time || booking.slot_time || '';
  if (!raw || raw === 'ASAP') return raw || 'ASAP';
  try {
    const dt = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleString('en-PK', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  } catch {
    /* use raw */
  }
  return raw;
}

export function isTerminalStatus(status: string): boolean {
  return ['completed', 'cancelled', 'refunded', 'disputed'].includes(status.toLowerCase());
}

export function isActiveWorkerStatus(status: string): boolean {
  return !isTerminalStatus(status);
}

export function isOfferStatus(status: string): boolean {
  return ['assigned', 'pending'].includes(status.toLowerCase());
}

export function customerLabel(booking: UserBooking): string {
  const svc = booking.service || 'Service';
  const time = formatWorkerTime(booking);
  return `${svc} · ${time}`;
}

export function routeStopLabel(booking: UserBooking, index: number): {
  n: number;
  time: string;
  who: string;
  area: string;
  dist: string;
  svc: string;
} {
  const ref = booking.booking_id ? booking.booking_id.slice(-6) : '—';
  return {
    n: index + 1,
    time: formatWorkerTime(booking),
    who: `Ref ${ref}`,
    area: (booking.scheduled_time || booking.slot_time || '').split(' ')[0] || '—',
    dist: '—',
    svc: booking.service || 'Service',
  };
}
