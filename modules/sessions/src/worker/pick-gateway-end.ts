import type { WorkerRunLimits } from '@heynixie/models';
import type { SandboxCount } from '@heynixie/spend';
import type { WorkerEnd } from './types';

// A worker whose sandbox the gateway found past its limit ends at a dollar or a token limit,
// whatever its own tally said, unless an answer, a stop, the minutes or a failed start ended the run
// first.
export function pickGatewayEnd(
  end: WorkerEnd,
  count: SandboxCount | null,
  limits: Pick<WorkerRunLimits, 'dollars'>,
): WorkerEnd {
  if (count === null || !count.tripped) {
    return end;
  }

  if (end.outcome === 'answered' || end.outcome === 'aborted' || end.outcome === 'sandbox_failed') {
    return end;
  }

  if (end.outcome === 'limit' && end.limit !== 'turns') {
    return end;
  }

  return { outcome: 'limit', limit: count.dollars >= limits.dollars ? 'dollars' : 'tokens' };
}
