import type { StartedClaim, StepInput, TasksContext } from '@heynixie/tasks';
import { claimTask, readInbox } from '@heynixie/tasks';

export type TestStep = StepInput & Pick<StartedClaim, 'startSequence'>;

export async function claimTestStep(context: TasksContext): Promise<TestStep> {
  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('no task was claimable');
  }

  return {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: await readInbox(context, claim.lease.workID),
    wake: claim.wake,
    startSequence: claim.startSequence,
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
  };
}
