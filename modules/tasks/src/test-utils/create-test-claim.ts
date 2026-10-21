import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import { createTask } from '../create-task';
import type { TaskClaim, TasksContext } from '../types';

export async function createTestClaim(context: TasksContext, brief: string): Promise<TaskClaim> {
  await createTask(context, brief);

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  return claim;
}
