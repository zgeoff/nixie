import type { Outcome, ProviderResponse } from './types';

// Maps a provider's response to the action's outcome. A refusal that can clear waits for the next
// attempt, by the schedule or longer when the provider names a retry time, and fails once the
// schedule runs out; an ambiguity is unknown, because the call may have reached the provider.
export function pickOutcome(
  response: ProviderResponse,
  attempt: number,
  retryDelaysMs: readonly number[],
): Outcome {
  if (response.kind === 'success') {
    return { status: 'done' };
  }
  if (response.kind === 'refused') {
    return { status: 'failed', reason: 'refused' };
  }
  if (response.kind === 'ambiguous') {
    return { status: 'unknown', reason: 'ambiguous' };
  }
  const delayMs = retryDelaysMs[attempt - 1];

  return delayMs === undefined
    ? { status: 'failed', reason: 'retries_exhausted' }
    : {
        status: 'pending',
        reason: 'refusal_can_clear',
        delayMs: Math.max(delayMs, response.retryAfterMs ?? 0),
      };
}
