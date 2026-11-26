import type { StepInput, StepResult } from '@heynixie/tasks';
import type { ReachedLimit } from './build-reached-limit';

// The step had work when its runner claimed it, so the task keeps that work for the raise. A step
// that ran no turn has no activity, and one whose turn spent has worked.
export function buildLimitResult(
  input: StepInput,
  limit: ReachedLimit,
  activity: 'none' | 'worked',
): StepResult {
  return {
    next: 'continue',
    records: [],
    acknowledged: [],
    sessionBoundary: input.sessionBoundary,
    run: { activity, limit },
  };
}
