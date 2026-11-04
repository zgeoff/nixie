import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { planBackoffDelay } from '@heynixie/retry';
import { buildPausedRecord } from './build-paused-record';
import { probeWakingInputSince } from './probe-waking-input-since';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import { StepFailedError } from './step-failed-error';
import { taskStepErroredCodec } from './task-step-errored-codec';
import type { StartedClaim, StepErrored, TasksContext, TasksTables } from './types';

export interface StepErrorOptions {
  readonly maxStepErrors: number;
  readonly retryDelayMs: number;

  readonly maxRetryDelayMs: number;
}

export function writeStepError(
  context: TasksContext,
  claim: StartedClaim,
  failure: StepErrorOptions & { readonly error: unknown },
): Promise<StepErrored> {
  const taskID = claim.lease.workID;

  return withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();

    await requireLease(tx, claim.lease, now);

    const task = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['step_errors', 'is_conversation', 'pause_requested'])
      .where('task_id', '=', taskID)
      .executeTakeFirstOrThrow();

    const errors = task.step_errors + 1;
    const stepFailure = failure.error instanceof StepFailedError ? failure.error : null;
    const isWaitingForOwner = stepFailure?.isWaitingForOwner === true;

    const hasWakeSinceStart = isWaitingForOwner
      ? await probeWakingInputSince(tx, taskID, claim.startSequence)
      : false;

    const retry = planRetry(
      {
        isConversation: task.is_conversation === 1,
        isWaitingForOwner,
        hasWakeSinceStart,
      },
      errors,
      failure,
    );

    const retryAt = now + retry.delayMs;

    await writeRecordsInTransaction(tx, context.log, [
      ...(stepFailure === null
        ? []
        : stepFailure.records.map((record) => ({ ...record, thread: taskID }))),
      {
        kind: 'task.step_errored',
        definitions: context.definitions(),
        thread: taskID,
        payload: taskStepErroredCodec.encode({
          taskID,
          stepKey: claim.stepKey,
          nextState: retry.nextState,
          errors,
          errorLimit: failure.maxStepErrors,
          ...(stepFailure === null ? {} : { reason: stepFailure.reason }),
          claimableAt: retryAt,
        }),
        erasable: { message: formatError(failure.error) },
      },
      ...(retry.nextState !== 'failed' && task.pause_requested === 1
        ? [buildPausedRecord(taskID, retry.nextState, context.definitions())]
        : []),
    ]);

    await resetLease(tx, claim.lease);

    return {
      taskID,
      stepKey: claim.stepKey,
      errors,
      errorLimit: failure.maxStepErrors,
      nextState: retry.nextState,
      retryAt,
      error: failure.error,
    };
  });
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
