import { planBackoffDelay } from '@heynixie/retry';
import type { ConnectorFailure } from '../types';
import type { RetryConfig } from './types';

export interface RetryProgress {
  // the attempts that have run
  readonly attempts: number;
  readonly elapsedMs: number;
}

export type RetryWait =
  | { readonly kind: 'wait'; readonly waitMs: number }
  | { readonly kind: 'stop' };

const backoff = { firstMs: 1000, maxMs: 2000 };

// A refusal never clears. A rate limit that names a time waits that time, and stops when the wait
// would use the whole budget. Any other failure waits on a backoff of 1 s, then 2 s, spread by
// `jitter`, a number from 0 up to 1.
export function pickRetryWait(
  failure: ConnectorFailure,
  progress: RetryProgress,
  config: RetryConfig,
  jitter: number,
): RetryWait {
  const canClear =
    failure.code === 'rate_limited' || failure.code === 'failed' || failure.code === 'no_answer';

  if (!canClear || progress.attempts >= config.maxAttempts) {
    return { kind: 'stop' };
  }

  const waitMs =
    failure.code === 'rate_limited' && failure.retryAfterMs !== undefined
      ? failure.retryAfterMs
      : Math.round(planBackoffDelay(progress.attempts, backoff) * (0.75 + 0.5 * jitter));

  return waitMs < config.budgetMs - progress.elapsedMs
    ? { kind: 'wait', waitMs }
    : { kind: 'stop' };
}
