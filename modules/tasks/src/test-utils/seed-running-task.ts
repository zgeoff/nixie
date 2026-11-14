import invariant from 'tiny-invariant';
import { claimTask } from '../task/projection/claim-task';
import type { TasksContext } from '../types';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export async function seedRunningTask(
  context: TasksContext,
  input: StartedTaskSeed,
): Promise<string> {
  const taskID = await seedTask(context, input);
  const claim = await claimTask(context, { holder: 'seed-runner', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  return taskID;
}
