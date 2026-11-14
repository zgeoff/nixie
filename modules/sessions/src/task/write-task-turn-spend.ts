import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import { writeFailedTurnSpend } from '@heynixie/tasks';
import type { TaskTurnEndPlan } from './plan-task-turn-end';

export interface TaskTurnStep {
  readonly taskID: string;
  readonly taskRunID: string;
}

// A step that threw commits no turn record, so its spend goes in on its own. The write checks no
// lease, so a step that lost its lease still counts what its turn spent.
export async function writeTaskTurnSpend(
  context: Pick<TasksContext, 'definitions' | 'log'> & { readonly logger: Logger },
  step: TaskTurnStep,
  plan: Pick<TaskTurnEndPlan, 'failedDollars'>,
): Promise<void> {
  if (plan.failedDollars !== null) {
    await writeFailedTurnSpend(context, {
      taskID: step.taskID,
      dollars: plan.failedDollars,
      taskRunID: step.taskRunID,
    });
  }
}
