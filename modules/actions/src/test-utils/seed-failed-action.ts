import type { ActionConnector } from '@heynixie/connectors';
import { claimLease } from '@heynixie/tasks';
import type { TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { runActionAttempt } from '../run-action-attempt';
import type { ActionRow } from '../types';
import type { AllowedCallSeed } from './build-mock-allowed-call';
import { readTestAction } from './read-test-action';
import { seedAction } from './seed-action';

const connector: ActionConnector = {
  run: () => Promise.resolve({ kind: 'refused', reason: 'no such recipient' }),
};

export async function seedFailedAction(
  context: TasksContext,
  input: AllowedCallSeed,
): Promise<ActionRow> {
  const queued = await seedAction(context, input);

  const lease = await claimLease(context, {
    kind: 'action',
    holder: 'seed',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: queued.action_id, taskID: queued.task_id }),
  });

  invariant(lease);

  await runActionAttempt(context, lease, {
    connectors: new Map([[queued.tool, connector]]),
    leaseMs: 60_000,
  });

  const action = await readTestAction(context.log.writer, queued.action_id);

  invariant(action.status === 'failed');

  return action;
}
