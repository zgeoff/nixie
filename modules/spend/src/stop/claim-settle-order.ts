import type { SpendContext } from '../types';
import { getSettleOrderState } from './get-settle-order-state';

// Whether facts are newer than the facts that the last settle used, and when they are, marks every
// read taken so far as settled. A read still in flight may hold a status from before this settle's,
// so a later settle of it would undo this one; it is refused, and the next read catches up.
export function claimSettleOrder(context: SpendContext, order: number): boolean {
  const state = getSettleOrderState(context);

  if (order <= state.settled) {
    return false;
  }

  state.settled = Math.max(order, state.taken);

  return true;
}
