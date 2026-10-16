import type { Logger } from '@heynixie/logger';
import type { StepErrored } from '@heynixie/tasks';

// Makes the callback that logs each step error as task.step_errored: the task, the step, the
// errors in a row, the task's next state, when it retries and the error's name. The error's message may hold free
// text, so it stays on the task's thread, where a forget can reach it.
export function makeStepErrorLogger(log: Logger): (errored: StepErrored) => void {
  return (errored) => {
    log('task.step_errored', {
      taskID: errored.taskID,
      stepKey: errored.stepKey,
      errors: errored.errors,
      nextState: errored.nextState,
      retryAt: errored.retryAt,
      error: errored.error instanceof Error ? errored.error.name : typeof errored.error,
    });
  };
}
