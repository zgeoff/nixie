import type { Lease, TaskLimits, TasksContext } from '@heynixie/tasks';
import { writeFailedTurnSpend, writeTaskLimitPause } from '@heynixie/tasks';
import type { TaskTurnEndPlan } from './plan-task-turn-end';

export interface TaskTurnStep {
  readonly lease: Lease;
  readonly stepKey: string;
  readonly startedBy: string;
  readonly limits: TaskLimits;
}

export async function writeTaskTurnSpend(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  step: TaskTurnStep,
  plan: Pick<TaskTurnEndPlan, 'reached' | 'failedDollars'>,
): Promise<void> {
  if (plan.reached !== null) {
    await writeTaskLimitPause(context, { ...step, used: plan.reached });
  }

  if (plan.failedDollars !== null) {
    await writeFailedTurnSpend(context, {
      lease: step.lease,
      stepKey: step.stepKey,
      dollars: plan.failedDollars,
    });
  }
}
