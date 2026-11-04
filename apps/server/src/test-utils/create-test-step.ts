import type { TasksContext } from '@heynixie/tasks';
import { claimTask, createTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { TestStep } from './claim-test-step';

export async function createTestStep(context: TasksContext): Promise<TestStep> {
  await createTask(context, 'send the weekly summary');

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  return {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    startSequence: claim.startSequence,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };
}
