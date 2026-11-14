import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import type { TasksContext } from '../types';
import { writeStepCommit } from '../write-step-commit';
import type { StartedTaskSeed } from './seed-task';
import { seedTask } from './seed-task';

export async function seedDoneTask(context: TasksContext, input: StartedTaskSeed): Promise<string> {
  const taskID = await seedTask(context, input);
  const claim = await claimTask(context, { holder: 'seed-runner', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const brief = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task_message'],
  });

  await writeStepCommit(context, claim, {
    next: 'done',
    records: [],
    acknowledged: brief.map((entry) => entry.record.sequence),
  });

  return taskID;
}
