import { parseDuration } from '@heynixie/clock';
import { maxWakeDurationMs, minWakeDurationMs } from '@heynixie/triggers';

// How long the reply rule of a send stands: `off` registers none, a duration from 1m to 3650d sets
// the length, and no value takes the deployment's reply expiry. Bad for text that is neither.
export function pickReplyExpiry(
  replyWake: string | undefined,
  defaultMs: number,
): { readonly status: 'ok'; readonly expiryMs: number | null } | { readonly status: 'bad' } {
  if (replyWake === undefined) {
    return { status: 'ok', expiryMs: defaultMs };
  }

  if (replyWake === 'off') {
    return { status: 'ok', expiryMs: null };
  }

  const durationMs = parseDuration(replyWake);

  return durationMs !== null && durationMs >= minWakeDurationMs && durationMs <= maxWakeDurationMs
    ? { status: 'ok', expiryMs: durationMs }
    : { status: 'bad' };
}
