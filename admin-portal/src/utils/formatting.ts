export function formatRs(amount: number): string {
  return `Rs ${Number(amount || 0).toLocaleString('en-PK')}`
}

export function statusBadgeClass(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('pending')) return 'badge badge-pending'
  if (s === 'active') return 'badge badge-active'
  if (s === 'suspended') return 'badge badge-suspended'
  if (s === 'rejected' || s === 'inactive') return 'badge badge-rejected'
  if (s === 'open' || s === 'in_review') return 'badge badge-open'
  if (s === 'resolved') return 'badge badge-active'
  return 'badge'
}
