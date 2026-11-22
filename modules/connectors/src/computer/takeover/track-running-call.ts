import type { RunningCall, RunningCalls } from './wait-for-running-calls';

// Counts a call as running from the moment it asks for its turn until it is answered, so a take-over
// waits for it. The limit is when the call gives up at the latest.
export async function trackRunningCall<Result>(
  calls: Omit<RunningCalls, 'clock'> & { readonly running: Set<RunningCall> },
  running: RunningCall,
  run: () => Promise<Result>,
): Promise<Result> {
  calls.running.add(running);

  try {
    return await run();
  } finally {
    calls.running.delete(running);

    if (calls.running.size === 0) {
      for (const drained of calls.drains.splice(0)) {
        drained();
      }
    }
  }
}
