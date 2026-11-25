import type { HeldToken } from './types';

// The refresh timings: a token refreshes 5 minutes before it expires, and at least every 7 days.
const refreshLeadMs = 5 * 60 * 1000;
const refreshEveryMs = 7 * 24 * 60 * 60 * 1000;

export function isDue(token: HeldToken, nowMs: number): boolean {
  if (token.state.retryAtMs !== null && nowMs < token.state.retryAtMs) {
    return false;
  }

  const lastSuccessAtMs = token.state.lastSuccessAtMs ?? 0;

  return token.expiresAtMs - nowMs <= refreshLeadMs || nowMs - lastSuccessAtMs >= refreshEveryMs;
}
