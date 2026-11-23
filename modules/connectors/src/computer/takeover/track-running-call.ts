import type { RunningCall } from './wait-for-running-calls';

export interface TrackedCalls {
  readonly running: Set<RunningCall>;

  // the admission the call runs inside, which takes the call's limit each time it moves
  readonly admission: RunningCall | null;
}

// Counts a call as running from the moment it asks for its turn until it is answered, so a take-over
// waits for it. The call moves its limit through `moveLimit` when it takes its turn.
export async function trackRunningCall<Result>(
  calls: TrackedCalls,
  endsAtMs: number,
  run: (moveLimit: (endsAtMs: number) => void) => Promise<Result>,
): Promise<Result> {
  const ended = Promise.withResolvers<void>();
  const call: RunningCall = { endsAtMs, ended: ended.promise };

  const moveLimit = (limitMs: number): void => {
    call.endsAtMs = limitMs;

    if (calls.admission !== null) {
      calls.admission.endsAtMs = limitMs;
    }
  };

  moveLimit(endsAtMs);

  calls.running.add(call);

  try {
    return await run(moveLimit);
  } finally {
    calls.running.delete(call);
    ended.resolve();
  }
}
