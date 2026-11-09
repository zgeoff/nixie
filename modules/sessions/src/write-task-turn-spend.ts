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
// a lost lease refuses still leaves the spend counted. A step whose pause fails never commits, so a
// failed pause records a completed turn's spend too.
export async function writeTaskTurnSpend(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  step: TaskTurnStep,
  plan: Pick<TaskTurnEndPlan, 'reached' | 'failedDollars' | 'pausedDollars'>,
): Promise<void> {
  const taskID = step.lease.workID;

  if (plan.failedDollars !== null) {
    await writeFailedTurnSpend(context, { taskID, dollars: plan.failedDollars });
  }

  if (plan.reached === null) {
    return;
  }

  await writeTaskLimitPause(context, { ...step, used: plan.reached }).catch(
    async (error: unknown) => {
      if (plan.pausedDollars !== null) {
        await writeFailedTurnSpend(context, { taskID, dollars: plan.pausedDollars });
      }

      throw error;
    },
  );
}
