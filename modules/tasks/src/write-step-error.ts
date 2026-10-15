import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { planBackoffDelay } from '@heynixie/retry';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import type { StepErrored, TaskClaim, TasksContext, TasksTables } from './types';

export interface StepErrorOptions {
  // how many failed steps in a row end a task as failed, or mark the conversation as failing
  readonly maxStepErrors: number;
  readonly retryDelayMs: number;

  // the longest wait between the conversation's tries, where its backoff stops growing
  readonly maxRetryDelayMs: number;
}

// Records a step that threw and frees the lease, and returns what it recorded. The retry follows
// planRetry, and the error's text is free text, so it sits in erasable.
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
      .select(['step_errors', 'is_conversation'])
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
        payload: {
          taskID,
          stepKey: claim.stepKey,
          nextState: retry.nextState,
          errors,
          errorLimit: failure.maxStepErrors,
          claimableAt: retryAt,
        },
        erasable: { message: formatError(failure.error) },
      },
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

// A task retries after the retry delay, and fails once its errors in a row reach the limit. The
// conversation never fails, because every deployment needs it to answer: its delay doubles with
// each error up to the maximum.
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
