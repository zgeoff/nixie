import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import type { TaskClaim, TasksContext, TasksTables } from './types';

export interface StepErrorOptions {
  // how many failed steps in a row end the task as failed
  readonly maxStepErrors: number;
  readonly retryDelayMs: number;
}

// Records a step that threw and frees the lease. The task retries after a delay, and fails once
// the errors in a row reach the limit. The error's text is free text, so it sits in erasable.
export async function writeStepError(
  context: TasksContext,
  claim: TaskClaim,
  failure: StepErrorOptions & { readonly error: unknown },
): Promise<void> {
  const taskID = claim.lease.workID;

  await withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();

    await requireLease(tx, claim.lease, now);

    const task = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('step_errors')
      .where('task_id', '=', taskID)
      .executeTakeFirstOrThrow();
    const errors = task.step_errors + 1;

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.step_errored',
        definitions: context.definitions(),
        thread: taskID,
        payload: {
          taskID,
          stepKey: claim.stepKey,
          nextState: errors >= failure.maxStepErrors ? 'failed' : 'ready',
          errors,
          claimableAt: now + failure.retryDelayMs,
        },
        erasable: { message: formatError(failure.error) },
      },
    ]);
    await resetLease(tx, claim.lease);
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
