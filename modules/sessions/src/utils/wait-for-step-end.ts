import type { RunningStep, TasksContext } from '@heynixie/tasks';
import { readRunningStep } from '@heynixie/tasks';

const stepEndPollMs = 25;

// Resolves once the step that a task runs now commits, fails or loses its lease. A step whose turn
// has ended can still commit records that hold session text, such as a summary, so a forget's
// cleanup erases that text only after this resolves.
export async function waitForStepEnd(
  context: Pick<TasksContext, 'log' | 'clock'>,
  taskID: string,
): Promise<void> {
  const running = await readRunningStep(context, taskID);

  if (running === null) {
    return;
  }

  let current: RunningStep | null = running;

  while (isSameStep(current, running)) {
    await Bun.sleep(stepEndPollMs);

    current = await readRunningStep(context, taskID);
  }
}

function isSameStep(current: RunningStep | null, running: RunningStep): boolean {
  return current?.stepKey === running.stepKey && current.generation === running.generation;
}
