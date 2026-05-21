/** Phase B — dispute status helpers (aligned with backend). */

export function isDisputePendingStatus(status?: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'open' || s === 'under_review';
}

export interface DisputeSubmitLike {
  dispute_status?: string;
  resolution?: string;
}

export function isDisputeAwaitingResolution(result: DisputeSubmitLike): boolean {
  return isDisputePendingStatus(result.dispute_status) && !(result.resolution || '').trim();
}
