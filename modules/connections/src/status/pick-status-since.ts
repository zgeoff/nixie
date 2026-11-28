import type { ConnectionRow } from '../types';
import { pickReachedAtMs } from './pick-reached-at-ms';
import type { AttentionStatus } from './types';

// When the status began. The clock sets an `expiring` status, 3 days before the grant ends, and a
// `needs_consent` status past the grant's end, and no other write records either time.
export function pickStatusSince(
  row: Pick<ConnectionRow, 'status' | 'status_since' | 'refresh_expires_at'>,
  status: AttentionStatus,
): number {
  const endsAtMs = row.refresh_expires_at;

  if (endsAtMs === null) {
    return row.status_since;
  }

  if (status === 'expiring') {
    return pickReachedAtMs('expiring', endsAtMs);
  }

  return status === 'needs_consent' && row.status !== 'needs_consent'
    ? pickReachedAtMs('needs_consent', endsAtMs)
    : row.status_since;
}
