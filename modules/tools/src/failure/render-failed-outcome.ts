import type { ToolOutcome } from '../types';
import { renderFailureMessage } from './render-failure-message';
import type { RetryDependencies } from './run-with-retries';

// An outcome that carries a connector failure, with the message the model reads written from it.
// Any other outcome stays as it is. A retry time counts from `failedAtMs`, when the failure came.
export function renderFailedOutcome(
  outcome: ToolOutcome,
  dependencies: RetryDependencies,
  failedAtMs: number,
): ToolOutcome {
  if (outcome.status !== 'error' || outcome.failure === undefined) {
    return outcome;
  }

  return {
    ...outcome,
    message: renderFailureMessage(outcome.failure, {
      nowMs: failedAtMs,
      detailChars: dependencies.config.detailChars,
    }),
  };
}
