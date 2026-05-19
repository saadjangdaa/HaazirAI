import { statusBadgeClass } from '../../utils/formatting'

export function Badge({ status }: { status: string }) {
  return <span className={statusBadgeClass(status)}>{status.replace('_', ' ')}</span>
}
