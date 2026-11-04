import type { TaskLimits } from '@heynixie/tasks';

export function isAtTaskLimit(used: TaskLimits, limits: TaskLimits): boolean {
  return used.turns >= limits.turns || used.dollars >= limits.dollars;
}
