import type { Logger } from '@heynixie/ops';
import { toErrorFields } from '@heynixie/ops';

export interface RetryOptions {
  // the start step's name, which each failure's log line carries
  readonly step: string;

  // aborts on a stop, which ends the retries with the signal's reason
  readonly signal: AbortSignal;
  readonly log: Logger;

  // the first wait after a failure, which doubles up to maxDelayMs: 1 s and 30 s by default
  readonly firstDelayMs?: number;
  readonly maxDelayMs?: number;
}

// Runs a start step until it succeeds, logging each failure and waiting longer after each. A step
// that needs impd, or a definitions seed that is refused, keeps nixie live and unready rather than
// stopping it, so the health endpoint shows which part holds the start.
export async function runWithRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const delay = { ms: options.firstDelayMs ?? 1000 };

  for (;;) {
    options.signal.throwIfAborted();

    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt follows the last one's wait
      return await attempt();
    } catch (error) {
      options.signal.throwIfAborted();

      options.log('start.retry', {
        step: options.step,
        delayMs: delay.ms,
        ...toErrorFields(error),
      });

      // oxlint-disable-next-line no-await-in-loop -- the wait between attempts
      await waitForDelay(delay.ms, options.signal);

      delay.ms = Math.min(delay.ms * 2, options.maxDelayMs ?? 30_000);
    }
  }
}

function waitForDelay(ms: number, signal: AbortSignal): Promise<void> {
  const waited = Promise.withResolvers<void>();
  const timer = setTimeout(waited.resolve, ms);

  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);

      waited.reject(signal.reason);
    },
    { once: true },
  );

  return waited.promise;
}
