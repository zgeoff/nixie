import type { TaskRunLimits } from '../types';

// The limits as a record holds them: a meter that the config leaves unset has no limit, which is
// null.
export function buildTaskRunLimits(limits: TaskRunLimits): {
  readonly turns: number | null;
  readonly dollars: number | null;
} {
  return { turns: limits.turns ?? null, dollars: limits.dollars ?? null };
}
