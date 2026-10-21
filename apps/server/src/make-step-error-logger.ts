import type { LogFields, Logger } from '@heynixie/logger';
import { SandboxHostError } from '@heynixie/sandbox';
import type { StepErrored } from '@heynixie/tasks';

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
