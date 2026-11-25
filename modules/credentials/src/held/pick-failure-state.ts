import { planBackoffDelay } from '@heynixie/retry';
import type { HeldState } from './types';

export type RefreshFailureKind = 'refused' | 'service_error' | 'no_answer';

const failuresBeforeFailing = 3;

// The pause after a failed refresh, which web fetch's host backoff also uses.
const retryBackoff = { firstMs: 30_000, maxMs: 300_000 } as const;

// The state after a refresh that gave no token. A refusal for good needs the owner. Three failures
// in a row mark the credential failing, and every failure pushes the next timed refresh back.
export function pickFailureState(
  previous: HeldState,
  kind: RefreshFailureKind,
  nowMs: number,
): HeldState {
  const failures = previous.failures + 1;
  const retryAtMs = nowMs + planBackoffDelay(failures, retryBackoff);

  if (kind === 'refused') {
    return {
      ...previous,
      status: 'needs_consent',
      sinceMs: nowMs,
      failures,
      retryAtMs,
    };
  }

  if (failures >= failuresBeforeFailing) {
    return {
      ...previous,
      status: 'failing',
      reason: kind,
      sinceMs: nowMs,
      failures,
      retryAtMs,
    };
  }

  return { ...previous, failures, retryAtMs };
}
