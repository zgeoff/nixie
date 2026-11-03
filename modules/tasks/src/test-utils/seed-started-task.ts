import invariant from 'tiny-invariant';
import { buildStepRunID } from '../build-step-run-id';
import type { StartedClaim, TasksContext } from '../types';
import { writeTaskStart } from '../write-task-start';

export interface StartedTaskSeed {
  readonly starter: StartedClaim;
  readonly name: string;
  readonly brief: string;
}

export async function seedStartedTask(
  context: TasksContext,
  seed: StartedTaskSeed,
): Promise<string> {
  const outcome = await writeTaskStart(context, {
    from: seed.starter.lease.workID,
    name: seed.name,
    brief: seed.brief,
    stepRunID: buildStepRunID(seed.starter),
  });

  invariant(outcome.status === 'started', 'the seeded start is valid');

  return outcome.taskID;
}
