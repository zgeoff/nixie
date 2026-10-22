import type { StepInput, StepResult } from '@heynixie/tasks';

export function runOffTaskStep(input: StepInput): Promise<StepResult> {
  return Promise.resolve({
    next: 'wait',
    records: [],
    acknowledged: input.inbox.map((record) => record.sequence),
  });
}
