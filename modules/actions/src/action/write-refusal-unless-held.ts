import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { isGateBarring, readTaskGate, requireLease, resetLease } from '@heynixie/tasks';
import { buildGateWork } from './build-gate-work';
import { buildRefusalRecords } from './build-refusal-records';
import { creditFailedActions } from './credit-failed-actions';
import type { Attempt } from './leased-records';
import type { AttemptStep } from './pick-attempt-step';

// A stop, a spending trip, a pause or a limit can land while the policy check runs. The refusal then
// settles nothing: the action stays pending, and its lease frees for the claim that follows the
// hold. Returns whether the refusal was written.
export function writeRefusalUnlessHeld(
  context: TasksContext,
  attempt: Attempt,
  step: Exclude<AttemptStep, { readonly kind: 'go' }>,
): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, attempt.lease, context.clock.now());

    const gate = await readTaskGate(tx, attempt.action.task_id, 'action');

    const isHeld = isGateBarring('action', gate, buildGateWork(attempt.action));

    if (isHeld) {
      await resetLease(tx, attempt.lease);

      return false;
    }

    const records = buildRefusalRecords(context, attempt, step);

    await writeRecordsInTransaction(tx, context.log, records);
    await creditFailedActions(tx, context.budgets, records);
    await resetLease(tx, attempt.lease);

    return true;
  });
}
