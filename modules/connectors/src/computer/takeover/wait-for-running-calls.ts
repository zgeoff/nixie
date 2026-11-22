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

// Waits until the calls running now have ended, and says whether they ended. It answers false as
// soon as one of them is still running past its own limit. A call that starts later is not waited
// for.
export async function waitForRunningCalls(calls: RunningCalls): Promise<boolean> {
  const waiting = [...calls.running];

  if (waiting.length === 0) {
    return true;
  }

  const gave = new AbortController();
  const unfinished = new Set(waiting);

  for (const call of waiting) {
    void dropWhenEnded(unfinished, call);
  }

  const allEnded = Promise.all(waiting.map((call) => call.ended));
  const pastLimit = sleepPastLimit(calls.clock, unfinished, gave.signal);

  const outcome = await Promise.race([
    labelAfter(allEnded, 'drained'),
    labelAfter(pastLimit, 'late'),
  ]);

  gave.abort();

  return outcome === 'drained';
}

async function dropWhenEnded(unfinished: Set<RunningCall>, call: RunningCall): Promise<void> {
  await call.ended;

  unfinished.delete(call);
}

// A call that takes its turn late moves its end, so the wait reads each limit again after each sleep.
async function sleepPastLimit(
  clock: Clock,
  unfinished: ReadonlySet<RunningCall>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const limitMs = Math.min(...[...unfinished].map((call) => call.endsAtMs));

    await clock.sleep(Math.max(0, limitMs - clock.now()), signal);

    if ([...unfinished].some((call) => clock.now() >= call.endsAtMs)) {
      return;
    }
  }
}
