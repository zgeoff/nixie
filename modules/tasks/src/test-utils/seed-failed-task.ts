import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import type { TasksContext } from '../types';
import { writeStepError } from '../write-step-error';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export async function seedFailedTask(
  context: TasksContext,
  input: StartedTaskSeed,
): Promise<string> {
  const taskID = await seedTask(context, input);
  const claim = await claimTask(context, { holder: 'seed-runner', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  await writeStepError(context, claim, {
    maxStepErrors: 1,
    retryDelayMs: 1000,
    maxRetryDelayMs: 1000,
    error: new Error('the step broke'),
  });

  return taskID;
}
