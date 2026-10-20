import type { StepInput, TasksContext } from '@heynixie/tasks';
import { claimTask, readInbox } from '@heynixie/tasks';

// Claims the next step the way a task runner does, with its task's unread inbox, and throws when no
// task is claimable.
export async function claimTestStep(context: TasksContext): Promise<StepInput> {
  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('no task was claimable');
  }

  return {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: await readInbox(context, claim.lease.workID),
    sessionBoundary: null,
    signal: new AbortController().signal,
  };
}
