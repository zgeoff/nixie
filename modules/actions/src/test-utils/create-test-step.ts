import type { TaskClaim, TasksContext } from '@heynixie/tasks';
import { claimTask, createTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

export async function createTestStep(context: TasksContext): Promise<TaskClaim> {
  await createTask(context, 'send the weekly summary');

  const step = await claimTask(context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(step);

  return step;
}
