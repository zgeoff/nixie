import { withWriteTransaction } from '@heynixie/log';
import type { ProposalConfig } from '@heynixie/proposals';
import type { TasksContext } from '@heynixie/tasks';
import { isGateBarring, readTaskGate, requireLease, resetLease } from '@heynixie/tasks';
import { buildGateWork } from './build-gate-work';
import type { Attempt } from './leased-records';
import type { AttemptStep } from './pick-attempt-step';
import { writeRefusalInTransaction } from './write-refusal-in-transaction';

// A stop, a spending trip, a pause or a limit can land while the policy check runs. The refusal then
// settles nothing: the action stays pending, and its lease frees for the claim that follows the
// hold. Returns whether the refusal was written.
export function writeRefusalUnlessHeld(
  context: TasksContext,
  attempt: Attempt,
  step: Exclude<AttemptStep, { readonly kind: 'go' }>,
  proposalConfig: ProposalConfig | undefined,
): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, attempt.lease, context.clock.now());

    const gate = await readTaskGate(tx, attempt.action.task_id, 'action');

    const isHeld = isGateBarring('action', gate, buildGateWork(attempt.action));

    if (isHeld) {
      await resetLease(tx, attempt.lease);

      return false;
    }

    await writeRefusalInTransaction(tx, context, { attempt, step, proposalConfig });
    await resetLease(tx, attempt.lease);

    return true;
  });
}
