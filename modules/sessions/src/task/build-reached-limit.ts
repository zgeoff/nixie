import type { TaskLimits, TaskUsage } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

export interface ReachedLimit {
  readonly meter: 'turns' | 'dollars';
  readonly used: number;
  readonly limit: number;
}

export function buildReachedLimit(
  meter: 'turns' | 'dollars',
  used: TaskUsage,
  limits: TaskLimits,
): ReachedLimit {
  const limit = limits[meter];

  invariant(limit !== null, `a task stopped at a ${meter} limit it does not have`);

  return { meter, used: used[meter], limit };
}
