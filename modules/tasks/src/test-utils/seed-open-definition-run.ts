import invariant from 'tiny-invariant';
import { claimTask } from '../task/projection/claim-task';
import type { StartedClaim, TasksContext } from '../types';
import { writeTestTriggerFire } from './write-test-trigger-fire';

export interface DefinitionRunSeed {
  readonly taskID: string;
  readonly definitionID: string;

  // the version that the fire pins, which the context's definition readers must answer for
  readonly definitionHash: string;
}

// Fires the definition's task and claims it, so a task run opens on the fire's version. Returns the
// claim that holds the open task run.
export async function seedOpenDefinitionRun(
  context: TasksContext,
  seed: DefinitionRunSeed,
): Promise<StartedClaim> {
  await writeTestTriggerFire(context, seed.taskID, {
    definitionID: seed.definitionID,
    definitionHash: seed.definitionHash,
    dedupeKey: `${seed.definitionID}|${crypto.randomUUID()}`,
  });

  const claim = await claimTask(context, {
    holder: 'seed-runner',
    leaseMs: 60_000,
    taskID: seed.taskID,
  });

  invariant(claim, 'the fired definition task is ready to claim');

  return claim;
}
