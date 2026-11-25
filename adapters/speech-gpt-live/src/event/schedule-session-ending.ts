import { sessionLimitMs, sessionWarningMs } from '../constants';
import { raiseSpeechEvent } from '../session/raise-speech-event';
import type { GPTLiveOptions, GPTLiveSession } from '../types';

// The provider sends no warning before its session limit, so the adapter raises one from a timer,
// `sessionWarningMs` before the reported expiry or the standard limit. A later call replaces it.
export function scheduleSessionEnding(
  options: GPTLiveOptions,
  session: GPTLiveSession,
  reportedExpiry: number | string | undefined,
): void {
  const expiresAtMs = parseExpiry(reportedExpiry) ?? options.clock.now() + sessionLimitMs;
  const delayMs = expiresAtMs - sessionWarningMs - options.clock.now();

  session.expiry.current?.abort();

  const timer = new AbortController();

  session.expiry.current = timer;
  void raiseSessionEnding(options, session, { timer, delayMs });
}

// The provider gives the expiry in epoch seconds, or as a date text.
function parseExpiry(expiry: number | string | undefined): number | null {
  if (typeof expiry === 'number') {
    return expiry < 1e12 ? expiry * 1000 : expiry;
  }

  if (typeof expiry === 'string') {
    const parsed = Date.parse(expiry);

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

interface EndingTimer {
  readonly timer: AbortController;
  readonly delayMs: number;
}

async function raiseSessionEnding(
  options: GPTLiveOptions,
  session: GPTLiveSession,
  ending: EndingTimer,
): Promise<void> {
  const signal = AbortSignal.any([ending.timer.signal, session.stopping.signal]);

  await options.clock.sleep(ending.delayMs, signal);

  if (!signal.aborted) {
    raiseSpeechEvent(session, { kind: 'session_ending' });
  }
}
