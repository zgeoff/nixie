import { parseDuration } from '@heynixie/clock';
import { minWakeDurationMs } from './constants';

export interface WakeTimingRequest {
  readonly expires: string | undefined;
  readonly window: string | undefined;
  readonly nowMs: number;

  // the window of a rule that names none
  readonly defaultWindowMs: number;
}

export type WakeTiming =
  | { readonly status: 'ok'; readonly expiresAt: number | null; readonly windowMs: number }
  | { readonly status: 'bad' };

// The expiry and the window of a rule, with no upper limit. A duration is bad when it is no duration
// or runs under a minute, or an expiry passes the last date a Date holds. The window is at most the
// expiry, and the default window shrinks to a short expiry.
export function pickWakeTiming(request: WakeTimingRequest): WakeTiming {
  const expiresMs = request.expires === undefined ? null : parseDuration(request.expires);
  const windowMs = request.window === undefined ? null : parseDuration(request.window);

  if (
    (request.expires !== undefined && !isUsable(expiresMs)) ||
    (request.window !== undefined && !isUsable(windowMs))
  ) {
    return { status: 'bad' };
  }

  const expiresAt = expiresMs === null ? null : request.nowMs + expiresMs;

  if (expiresAt !== null && Number.isNaN(new Date(expiresAt).getTime())) {
    return { status: 'bad' };
  }

  if (expiresMs !== null && windowMs !== null && windowMs > expiresMs) {
    return { status: 'bad' };
  }

  const defaultMs =
    expiresMs === null ? request.defaultWindowMs : Math.min(request.defaultWindowMs, expiresMs);

  return { status: 'ok', expiresAt, windowMs: windowMs ?? defaultMs };
}

function isUsable(durationMs: number | null): durationMs is number {
  return durationMs !== null && durationMs >= minWakeDurationMs;
}
