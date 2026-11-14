import type { Clock } from '@heynixie/clock';

export interface TimeLimit {
  readonly clock: Clock;

  readonly deadline: number;
  readonly message: string;
}

export async function waitOrTimeOut<T>(promise: Promise<T>, limit: TimeLimit): Promise<T> {
  // Promise.race takes the first settled input in order, so an already settled call would beat a
  // deadline that passed between calls.
  if (limit.deadline <= limit.clock.now()) {
    throw new Error(limit.message);
  }

  const settled = new AbortController();

  try {
    return await Promise.race([promise, waitForDeadline(limit, settled.signal)]);
  } finally {
    settled.abort();
  }
}

async function waitForDeadline(limit: TimeLimit, settled: AbortSignal): Promise<never> {
  await limit.clock.sleep(limit.deadline - limit.clock.now(), settled);

  throw new Error(limit.message);
}
