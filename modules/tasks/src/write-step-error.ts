import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { StepErrorOptions } from './build-step-failure-plan';
import { buildStepFailurePlan } from './build-step-failure-plan';
import { probeWakingInputSince } from './probe-waking-input-since';
import { requireLease } from './require-lease';
import { resetLease } from './reset-lease';
import type { StartedClaim, StepErrored, TasksContext, TasksTables } from './types';

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

    const hasWakeSinceStart = await probeWakingInputSince(tx, taskID, claim.startSequence);

    const plan = buildStepFailurePlan(
      {
        taskID,
        stepKey: claim.stepKey,
        stepErrors: task.step_errors,
        isConversation: task.is_conversation === 1,
        isPauseRequested: task.pause_requested === 1,
        hasWakeSinceStart,
        now,
        definitions: context.definitions(),
      },
      failure.error,
      failure,
    );

    await writeRecordsInTransaction(tx, context.log, plan.records);
    await resetLease(tx, claim.lease);

    return {
      taskID,
      stepKey: claim.stepKey,
      errors: plan.errors,
      errorLimit: failure.maxStepErrors,
      nextState: plan.nextState,
      retryAt: plan.retryAt,
      error: failure.error,
    };
  });
}
