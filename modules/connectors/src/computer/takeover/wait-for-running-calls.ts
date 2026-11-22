import type { Clock } from '@heynixie/clock';
import { labelAfter } from '../label-after';

export interface RunningCall {
  readonly endsAtMs: number;
}

export interface RunningCalls {
  readonly clock: Clock;
  readonly running: ReadonlySet<RunningCall>;

  // what runs when the last call ends
  readonly drains: (() => void)[];
}

// Waits until the calls from the tools have ended, up to the longest of their own limits, and says
// whether they ended.
export async function waitForRunningCalls(calls: RunningCalls): Promise<boolean> {
  if (calls.running.size === 0) {
    return true;
  }

  const endTimes = [...calls.running].map((call) => call.endsAtMs);
  const latestEndMs = Math.max(...endTimes);
  const drained = Promise.withResolvers<void>();

  calls.drains.push(() => {
    drained.resolve();
  });

  const gave = new AbortController();

  const waitMs = Math.max(0, latestEndMs - calls.clock.now());

  const outcome = await Promise.race([
    labelAfter(drained.promise, 'drained'),
    labelAfter(calls.clock.sleep(waitMs, gave.signal), 'late'),
  ]);

  gave.abort();

  return outcome === 'drained';
}
