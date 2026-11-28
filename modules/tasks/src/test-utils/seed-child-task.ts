import invariant from 'tiny-invariant';
import { claimTask } from '../task/projection/claim-task';
import type { TasksContext } from '../types';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export interface ChildTaskSeed extends Omit<StartedTaskSeed, 'starter'> {
  // a ready task, which the seed claims so that its running step starts the child
  readonly parentID: string;
}

export async function seedChildTask(context: TasksContext, input: ChildTaskSeed): Promise<string> {
  const claim = await claimTask(context, {
    holder: 'seed-runner',
    leaseMs: 60_000,
    taskID: input.parentID,
  });

  invariant(claim, 'the parent task is ready to claim');

  return seedTask(context, { ...input, starter: claim });
}
