import type { RunStep, TasksContext } from '@heynixie/tasks';
import { claimTask, runTaskStep } from '@heynixie/tasks';

export async function runNextStep(context: TasksContext, runStep: RunStep): Promise<void> {
  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('no task had work to claim');
  }

  await runTaskStep(context, claim, {
    runStep,
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });
}
