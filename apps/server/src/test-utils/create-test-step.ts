import type { StepInput, TasksContext } from '@heynixie/tasks';
import { claimTask, createTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

export async function createTestStep(context: TasksContext): Promise<StepInput> {
  await createTask(context, 'send the weekly summary');

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  return {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };
}
