import type { RunningStep, TasksContext } from '@heynixie/tasks';
import { readRunningStep } from '@heynixie/tasks';

const stepEndPollMs = 25;

// Only a step whose turn started: one still waiting to start waits for the cleanup in turn.
// Resolves once that step commits, fails or loses its lease, because a step whose turn ended can
// still commit a session summary that the cleanup must then erase.
export async function waitForStepEnd(
  context: Pick<TasksContext, 'log' | 'clock'>,
  taskID: string,
  step: RunningStep | undefined,
): Promise<void> {
  if (step === undefined) {
    return;
  }

  let current = await readRunningStep(context, taskID);

  while (isSameStep(current, step)) {
    await Bun.sleep(stepEndPollMs);

    current = await readRunningStep(context, taskID);
  }
}

function isSameStep(current: RunningStep | null, step: RunningStep): boolean {
  return current?.stepKey === step.stepKey && current.generation === step.generation;
}
