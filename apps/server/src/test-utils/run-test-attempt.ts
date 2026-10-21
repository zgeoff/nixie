import type { ActionAttemptOptions } from '@heynixie/actions';
import { claimAction, runActionAttempt } from '@heynixie/actions';
import type { TasksContext } from '@heynixie/tasks';

export async function runTestAttempt(
  context: TasksContext,
  connectors: ActionAttemptOptions['connectors'],
): Promise<void> {
  const lease = await claimAction(context, { holder: 'action-runner', leaseMs: 60_000 });

  if (lease === null) {
    throw new Error('no queued action was claimable');
  }

  await runActionAttempt(context, lease, { connectors, leaseMs: 60_000 });
}
