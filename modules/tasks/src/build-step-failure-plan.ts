import type { Definitions, RecordInput } from '@heynixie/log';
import { planBackoffDelay } from '@heynixie/retry';
import { buildPausedRecord } from './build-paused-record';
import { StepFailedError } from './step-failed-error';
import { taskStepErroredCodec } from './task-step-errored-codec';

export interface StepErrorOptions {
  readonly maxStepErrors: number;
  readonly retryDelayMs: number;

  readonly maxRetryDelayMs: number;
}

export interface StepFailureFacts {
  readonly taskID: string;
  readonly stepKey: string;
  readonly stepErrors: number;
  readonly isConversation: boolean;
  readonly isPauseRequested: boolean;
  readonly hasWakeSinceStart: boolean;
  readonly now: number;
  readonly definitions: Definitions;
}

export interface StepFailurePlan {
  readonly records: readonly RecordInput[];
  readonly errors: number;
  readonly nextState: 'ready' | 'waiting' | 'failed';
  readonly retryAt: number;
}

export function buildStepFailurePlan(
  facts: StepFailureFacts,
  error: unknown,
  options: StepErrorOptions,
): StepFailurePlan {
  const errors = facts.stepErrors + 1;
  const stepFailure = error instanceof StepFailedError ? error : null;

  const retry = planRetry(
    {
      isConversation: facts.isConversation,
      isWaitingForOwner: stepFailure?.isWaitingForOwner === true,
      hasWakeSinceStart: facts.hasWakeSinceStart,
    },
    errors,
    options,
  );

  const retryAt = facts.now + retry.delayMs;

  return {
    records: [
      ...(stepFailure === null
        ? []
        : stepFailure.records.map((record) => ({ ...record, thread: facts.taskID }))),
      {
        kind: 'task.step_errored',
        definitions: facts.definitions,
        thread: facts.taskID,
        payload: taskStepErroredCodec.encode({
          taskID: facts.taskID,
          stepKey: facts.stepKey,
          nextState: retry.nextState,
          errors,
          errorLimit: options.maxStepErrors,
          ...(stepFailure === null ? {} : { reason: stepFailure.reason }),
          claimableAt: retryAt,
        }),
        erasable: { message: formatError(error) },
      },
      ...(retry.nextState !== 'failed' && facts.isPauseRequested
        ? [buildPausedRecord(facts.taskID, retry.nextState, facts.definitions)]
        : []),
    ],
    errors,
    nextState: retry.nextState,
    retryAt,
  };
}

interface RetryFacts {
  readonly isConversation: boolean;

  readonly isWaitingForOwner: boolean;

  readonly hasWakeSinceStart: boolean;
}

// A conversation that waits for its owner takes its next step from a message or a retry, both of
// which move it to ready. A message that arrived while the step ran moved nothing, because the
// task was running, so it makes the task ready here.
function planRetry(
  facts: RetryFacts,
  errors: number,
  options: StepErrorOptions,
): { readonly nextState: 'ready' | 'waiting' | 'failed'; readonly delayMs: number } {
  if (facts.isConversation && facts.isWaitingForOwner) {
    return { nextState: facts.hasWakeSinceStart ? 'ready' : 'waiting', delayMs: 0 };
  }

  if (facts.isConversation) {
    return {
      nextState: 'ready',
      delayMs: planBackoffDelay(errors, {
        firstMs: options.retryDelayMs,
        maxMs: options.maxRetryDelayMs,
      }),
    };
  }

  return {
    nextState: errors >= options.maxStepErrors ? 'failed' : 'ready',
    delayMs: options.retryDelayMs,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
