import { expiringWindowMs } from '../connection/pick-connection-status';

// When the clock took a connection into a status: 3 days before its grant ends for `expiring`, and at
// the end for `needs_consent`. The sweep may record it later, so the time comes from the grant.
export function pickReachedAtMs(status: 'expiring' | 'needs_consent', endsAtMs: number): number {
  return status === 'expiring' ? endsAtMs - expiringWindowMs : endsAtMs;
}
