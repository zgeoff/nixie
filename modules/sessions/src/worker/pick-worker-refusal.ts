import type { SandboxCount } from '@heynixie/spend';
import type { WorkerRefusal } from './types';

// The route or provider limit that refused the worker's sandbox since the run began, or null when
// the gateway made no such refusal. A refusal at the sandbox's own limit ends the run at its dollar
// or token limit instead.
export function pickWorkerRefusal(
  count: SandboxCount | null,
  sinceMs: number,
): WorkerRefusal | null {
  const refusal = count?.lastRefusal ?? null;

  if (refusal === null || refusal.counter === 'sandbox' || refusal.atMs < sinceMs) {
    return null;
  }

  return { counter: refusal.counter, route: refusal.route, provider: refusal.provider };
}
