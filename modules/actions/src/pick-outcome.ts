import type { ProviderResponse } from '@heynixie/connectors';
import type { Outcome } from './types';

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
        delayMs: Math.max(delayMs, findRetryAfterMs(response) ?? 0),
      };
}

function findRetryAfterMs(response: ProviderResponse): number | undefined {
  const retryAfterMs = response.kind === 'refused_retryable' ? response.retryAfterMs : undefined;

  return Number.isFinite(retryAfterMs) ? retryAfterMs : undefined;
}
