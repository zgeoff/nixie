import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { writeTaskLimitPause } from '../task/limit/write-task-limit-pause';
import { claimTask } from '../task/projection/claim-task';
import type { StartedClaim, TaskLimits, TasksContext } from '../types';
import { seedTask } from './seed-task';

export interface PausedTaskSeed {
  readonly starter: StartedClaim;
  readonly limits: TaskLimits;
}

// A started task whose step met its limit, committed and paused.
export async function seedPausedTask(context: TasksContext, seed: PausedTaskSeed): Promise<string> {
  const taskID = await seedTask(context, {
    starter: seed.starter,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { limits: seed.limits },
  });

  const claim = await claimTask(context, { holder: 'seed-runner', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  await writeTaskLimitPause(context, {
    lease: claim.lease,
    stepKey: claim.stepKey,
    startedBy: seed.starter.lease.workID,
    used: seed.limits,
    limits: seed.limits,
  });

  await writeStepCommit(context, claim, { next: 'continue', records: [], acknowledged: [] });

  return taskID;
}
