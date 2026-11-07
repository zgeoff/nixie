import type { RunStep, StepErrored, TasksContext } from '@heynixie/tasks';
import { writeInboxRecords } from '@heynixie/tasks';
import { runClaimedTestStep } from './run-claimed-test-step';

export async function sendTestMessage(
  context: TasksContext,
  runStep: RunStep,
  text: string,
): Promise<StepErrored | null> {
  await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    },
  ]);

  return runClaimedTestStep(context, runStep);
}
