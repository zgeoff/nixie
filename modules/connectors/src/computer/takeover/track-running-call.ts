import type { RunningCall } from './wait-for-running-calls';

// Counts a call as running from the moment it asks for its turn until it is answered, so a take-over
// waits for it. The call gets its record, whose limit it moves when it takes its turn.
export async function trackRunningCall<Result>(
  running: Set<RunningCall>,
  endsAtMs: number,
  run: (call: RunningCall) => Promise<Result>,
): Promise<Result> {
  const ended = Promise.withResolvers<void>();
  const call: RunningCall = { endsAtMs, ended: ended.promise };

  running.add(call);

  try {
    return await run(call);
  } finally {
    running.delete(call);
    ended.resolve();
  }
}
