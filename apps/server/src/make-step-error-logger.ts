import type { LogFields, Logger } from '@heynixie/logger';
import { SandboxHostError } from '@heynixie/sandbox';
import type { StepErrored } from '@heynixie/tasks';

// Makes the callback that logs each step error as task.step_errored with the error's name, never
// its message, which may hold free text and stays on the task's thread. A sandbox host error adds
// the call, the host's code and the host's text, which never quote the turn's work.
export function makeStepErrorLogger(log: Logger): (errored: StepErrored) => void {
  return (errored) => {
    log('task.step_errored', {
      taskID: errored.taskID,
      stepKey: errored.stepKey,
      errors: errored.errors,
      nextState: errored.nextState,
      retryAt: errored.retryAt,
      error: errored.error instanceof Error ? errored.error.name : typeof errored.error,
      ...buildHostFields(errored.error),
    });
  };
}

function buildHostFields(error: unknown): LogFields {
  return error instanceof SandboxHostError
    ? { call: error.call, code: error.code, hostMessage: error.hostMessage }
    : {};
}
