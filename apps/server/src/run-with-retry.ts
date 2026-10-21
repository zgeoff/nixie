import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { planBackoffDelay } from '@heynixie/retry';

export interface RetryOptions {
  readonly step: string;

  readonly signal: AbortSignal;
  readonly log: Logger;

  readonly clock: Clock;

  readonly firstDelayMs?: number;
  readonly maxDelayMs?: number;
}

export async function runWithRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const state = { failures: 0 };

  for (;;) {
    options.signal.throwIfAborted();

    try {
      return await attempt();
    } catch (error) {
      options.signal.throwIfAborted();

      state.failures += 1;

      const delayMs = planBackoffDelay(state.failures, {
        firstMs: options.firstDelayMs ?? 1000,
        maxMs: options.maxDelayMs ?? 30_000,
      });

      options.log('start.retry', {
        step: options.step,
        delayMs,
        ...toErrorFields(error),
      });

      await options.clock.sleep(delayMs, options.signal);
    }
  }
}
