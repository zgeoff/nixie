import type { TaskClaim, TasksContext } from '@heynixie/tasks';
import { claimTask, createTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

// Creates a task and claims its first step, as a task runner does before the step makes a tool
// call. The step's lease lasts 60 s on the context's clock.
export async function createTestStep(context: TasksContext): Promise<TaskClaim> {
  await createTask(context, 'send the weekly summary');

  const step = await claimTask(context, { holder: 'step-runner', leaseMs: 60_000 });

  // the task just created is ready, so the claim finds a task
  invariant(step);
  return step;
}
