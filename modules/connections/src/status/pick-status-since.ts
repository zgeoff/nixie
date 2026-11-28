import type { ConnectionRow } from '../types';
import { pickReachedAtMs } from './pick-reached-at-ms';
import type { AttentionStatus } from './types';

// When the status began. The clock sets an `expiring` status, 3 days before the grant ends, and a
// `needs_consent` status past the grant's end, and no other write records either time. A store that
// marks the connection as needing consent after its grant ended leaves the status from that end.
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

  if (status !== 'needs_consent') {
    return row.status_since;
  }

  const endedAtMs = pickReachedAtMs('needs_consent', endsAtMs);

  return row.status === 'needs_consent' ? Math.min(row.status_since, endedAtMs) : endedAtMs;
}
