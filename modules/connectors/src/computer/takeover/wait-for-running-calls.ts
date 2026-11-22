import type { Clock } from '@heynixie/clock';
import { labelAfter } from '../label-after';

export interface RunningCall {
  // when the call gives up at the latest: its turn wait first, then its own timeout from the moment
  // it takes its turn
  endsAtMs: number;

  // settles once the call has been answered
  readonly ended: Promise<void>;
}

export interface RunningCalls {
  readonly clock: Clock;
  readonly running: ReadonlySet<RunningCall>;
}

// Waits until the calls running now have ended, up to the latest of their own limits, and says
// whether they ended. A call that starts later is not waited for.
export async function waitForRunningCalls(calls: RunningCalls): Promise<boolean> {
  const waiting = [...calls.running];

  if (waiting.length === 0) {
    return true;
  }

  const latestEndMs = Math.max(...waiting.map((call) => call.endsAtMs));

  const gave = new AbortController();

  // a call that takes its turn late moves its end, so the wait reads the limit again after each sleep
  const allEnded = Promise.all(waiting.map((call) => call.ended));
  const pastLimit = sleepPastLimit(calls.clock, waiting, latestEndMs, gave.signal);

  const outcome = await Promise.race([
    labelAfter(allEnded, 'drained'),
    labelAfter(pastLimit, 'late'),
  ]);

  gave.abort();

  return outcome === 'drained';
}

async function sleepPastLimit(
  clock: Clock,
  waiting: readonly RunningCall[],
  firstLimitMs: number,
  signal: AbortSignal,
): Promise<void> {
  let limitMs = firstLimitMs;

  while (!signal.aborted) {
    await clock.sleep(Math.max(0, limitMs - clock.now()), signal);

    limitMs = Math.max(...waiting.map((call) => call.endsAtMs));

    if (clock.now() >= limitMs) {
      return;
    }
  }
}
