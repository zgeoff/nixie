import type { StepInput, StepResult } from '@heynixie/tasks';

export function runUnknownTaskStep(input: StepInput): Promise<StepResult> {
  return Promise.reject(new Error(`no runner runs the task ${input.taskID}`));
}
