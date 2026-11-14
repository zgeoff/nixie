import type { TaskLimits } from '@heynixie/tasks';

export interface ReachedLimit {
  readonly meter: 'turns' | 'dollars';
  readonly used: number;
  readonly limit: number;
}

export function buildReachedLimit(
  meter: 'turns' | 'dollars',
  used: TaskLimits,
  limits: TaskLimits,
): ReachedLimit {
  return { meter, used: used[meter], limit: limits[meter] };
}
