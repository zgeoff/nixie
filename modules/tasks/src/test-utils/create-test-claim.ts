import invariant from 'tiny-invariant';
import { createTask } from '../task/create-task';
import { claimTask } from '../task/projection/claim-task';
import type { StartedClaim, TasksContext } from '../types';

export async function createTestClaim(context: TasksContext, brief: string): Promise<StartedClaim> {
  await createTask(context, brief);

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  return claim;
}
