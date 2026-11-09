import type { RunStep, StepErrored, TasksContext } from '@heynixie/tasks';
import { claimTask, runTaskStep } from '@heynixie/tasks';

export async function runClaimedTestStep(
  context: TasksContext,
  runStep: RunStep,
): Promise<StepErrored | null> {
  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the conversation had no work to claim');
  }

  return runTaskStep(context, claim, {
    runStep,
    leaseMs: 60_000,
    logger: () => {},
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });
}
