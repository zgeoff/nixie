import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import { createTask } from '../create-task';
import type { TaskClaim, TasksContext } from '../types';

// Creates a task with the brief and claims a ready task's next step for runner-a, under a 60 s
// lease on the context's clock. On a store with no other ready task, the claim takes the new task.
export async function createTestClaim(context: TasksContext, brief: string): Promise<TaskClaim> {
  await createTask(context, brief);

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  // the task just created is ready, so the claim finds a task
  invariant(claim);

  return claim;
}
