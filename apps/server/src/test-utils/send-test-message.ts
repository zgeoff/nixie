import type { RunStep, TasksContext } from '@heynixie/tasks';
import { claimTask, runTaskStep, writeInboxRecords } from '@heynixie/tasks';

// Sends the owner a message on the conversation thread, then claims the task it wakes and runs that
// one step to its commit. It throws when no task has work to claim.
export async function sendTestMessage(
  context: TasksContext,
  runStep: RunStep,
  text: string,
): Promise<void> {
  await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    },
  ]);

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the conversation had no work to claim');
  }
  await runTaskStep(context, claim, {
    runStep,
    leaseMs: 60_000,
    maxStepErrors: 1,
    retryDelayMs: 30_000,
  });
}
