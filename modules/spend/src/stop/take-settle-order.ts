import type { SpendContext } from '../types';
import { getSettleOrderState } from './get-settle-order-state';

// The next place in line for facts that are about to be read. Each place is its own, so two reads
// in the same millisecond still have an order.
export function takeSettleOrder(context: SpendContext): number {
  const state = getSettleOrderState(context);

  state.taken += 1;

  return state.taken;
}
