import type { SpendContext } from '../types';

// the instant of the newest facts that each log's route stops settled from
const settledAtMs = new WeakMap<object, number>();

// Whether facts read at the instant are no older than the facts that the last settle used, and when
// they are, marks them as the newest. A poll that read the gateway before a raise, and settles after
// it, holds an older count than the raise's, and must not put back a stop that the raise cleared.
export function claimSettleOrder(context: SpendContext, factsAtMs: number): boolean {
  const newest = settledAtMs.get(context.log.writer);

  if (newest !== undefined && factsAtMs < newest) {
    return false;
  }

  settledAtMs.set(context.log.writer, factsAtMs);

  return true;
}
