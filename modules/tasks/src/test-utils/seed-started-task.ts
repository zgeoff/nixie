import invariant from 'tiny-invariant';
import { buildStepRunID } from '../build-step-run-id';
import { startedTaskDefaultTools } from '../started-task-default-tools';
import type { StartedClaim, TaskRunOptions, TasksContext } from '../types';
import { writeTaskStart } from '../write-task-start';

export interface StartedTaskSeed {
  readonly starter: StartedClaim;
  readonly name: string;
  readonly brief: string;
  readonly options?: Partial<TaskRunOptions>;
  readonly hopLimit?: number;
}

export async function seedStartedTask(
  context: TasksContext,
  seed: StartedTaskSeed,
): Promise<string> {
  const outcome = await writeTaskStart(context, {
    from: seed.starter.lease.workID,
    name: seed.name,
    brief: seed.brief,
    options: {
      model: null,
      profile: null,
      persona: 'none',
      memory: 'none',
      tools: startedTaskDefaultTools,
      report: 'wake',
      limits: { turns: 25, dollars: 2 },
      ...seed.options,
    },
    hopLimit: seed.hopLimit ?? 6,
    stepRunID: buildStepRunID(seed.starter),
  });

  invariant(outcome.status === 'started', 'the seeded start is valid');

  return outcome.taskID;
}
