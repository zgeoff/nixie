import type { StepInput, TasksContext } from '@heynixie/tasks';
import { claimTask, createTask } from '@heynixie/tasks';

// Creates a task and claims its first step, and returns the input a task runner passes that step,
// with an empty inbox. The step's lease lasts 60 s on the context's clock.
export async function createTestStep(context: TasksContext): Promise<StepInput> {
  await createTask(context, 'send the weekly summary');

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the task created for the step was not claimable');
  }
  return {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };
}
