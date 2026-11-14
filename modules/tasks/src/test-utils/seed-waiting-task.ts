import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { claimTask } from '../task/projection/claim-task';
import type { TasksContext } from '../types';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export async function seedWaitingTask(
  context: TasksContext,
  input: StartedTaskSeed,
): Promise<string> {
  const taskID = await seedTask(context, input);
  const claim = await claimTask(context, { holder: 'seed-runner', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const brief = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task_message'],
  });

  await writeStepCommit(context, claim, {
    next: 'wait',
    records: [],
    acknowledged: brief.map((entry) => entry.record.sequence),
  });

  return taskID;
}
