import type { SpendContext } from '../types';
import { getSettleOrderState } from './get-settle-order-state';

// Whether facts are newer than the facts that the last settle used, and when they are, marks them
// as settled. A settle that writes marks every read taken so far: a read still in flight may hold a
// status from before this one's, so it is refused, and the next read catches up.
export function claimSettleOrder(
  context: SpendContext,
  order: number,
  isWriting: boolean,
): boolean {
  const state = getSettleOrderState(context);

  if (order <= state.settled) {
    return false;
  }

  state.settled = isWriting ? Math.max(order, state.taken) : order;

  return true;
}
