import type { SpendContext } from '../types';
import { getSettleOrderState } from './get-settle-order-state';

// Whether facts are newer than the facts that the last settle used, and when they are, marks them
// as the newest. The orders are counted, so two reads in one millisecond still differ.
export function claimSettleOrder(context: SpendContext, order: number): boolean {
  const state = getSettleOrderState(context);

  if (order <= state.settled) {
    return false;
  }

  state.settled = order;

  return true;
}
