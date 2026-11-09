import type { Lease, TaskLimits, TasksContext } from '@heynixie/tasks';
import { writeFailedTurnSpend, writeTaskLimitPause } from '@heynixie/tasks';
import type { TaskTurnEndPlan } from './plan-task-turn-end';

export interface TaskTurnStep {
  readonly lease: Lease;
  readonly stepKey: string;
  readonly startedBy: string;
  readonly limits: TaskLimits;
}

// The spend goes in before the pause, so the limit record counts nothing past it, and a pause that
// a lost lease refuses still leaves the spend counted.
export async function writeTaskTurnSpend(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  step: TaskTurnStep,
  plan: Pick<TaskTurnEndPlan, 'reached' | 'failedDollars'>,
): Promise<void> {
  if (plan.failedDollars !== null) {
    await writeFailedTurnSpend(context, { taskID: step.lease.workID, dollars: plan.failedDollars });
  }

  if (plan.reached !== null) {
    await writeTaskLimitPause(context, { ...step, used: plan.reached });
  }
}
