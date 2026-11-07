import invariant from 'tiny-invariant';
import { claimTask } from '../claim-task';
import type { StartedClaim, TaskLimits, TasksContext } from '../types';
import { writeStepCommit } from '../write-step-commit';
import { writeTaskLimitPause } from '../write-task-limit-pause';
import { seedStartedTask } from './seed-started-task';

export interface HeldTaskSeed {
  readonly starter: StartedClaim;
  readonly limits: TaskLimits;
}

// A started task whose step met its limit, committed and paused.
export async function seedHeldTask(context: TasksContext, seed: HeldTaskSeed): Promise<string> {
  const taskID = await seedStartedTask(context, {
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
    isWorkCut: false,
  });

  await writeStepCommit(context, claim, { next: 'continue', records: [], acknowledged: [] });

  return taskID;
}
