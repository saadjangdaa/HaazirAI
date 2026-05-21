/** Phase A — client helpers aligned with backend dispute eligibility. */

export function isDisputeEligibleStatus(status: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'cancelled';
}
