import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { planBackoffDelay } from '@heynixie/retry';
import { buildPausedRecord } from './build-paused-record';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import { taskStepErroredCodec } from './task-step-errored-codec';
import type { StepErrored, TaskClaim, TasksContext, TasksTables } from './types';

export interface StepErrorOptions {
  readonly maxStepErrors: number;
  readonly retryDelayMs: number;

  readonly maxRetryDelayMs: number;
}

export function writeStepError(
  context: TasksContext,
  claim: TaskClaim,
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
    const retry = planRetry(task.is_conversation === 1, errors, failure);
    const retryAt = now + retry.delayMs;

    await writeRecordsInTransaction(tx, context.log, [
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
          claimableAt: retryAt,
        }),
        erasable: { message: formatError(failure.error) },
      },
      ...(retry.nextState === 'ready' && task.pause_requested === 1
        ? [buildPausedRecord(taskID, 'ready', context.definitions())]
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

function planRetry(
  isConversation: boolean,
  errors: number,
  options: StepErrorOptions,
): { readonly nextState: 'ready' | 'failed'; readonly delayMs: number } {
  if (isConversation) {
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
