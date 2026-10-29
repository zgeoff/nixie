import type { StepResult } from '@heynixie/tasks';

export function runHeldTaskStep(): Promise<StepResult> {
  return Promise.resolve({ next: 'hold', records: [], acknowledged: [] });
}
