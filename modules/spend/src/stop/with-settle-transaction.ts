import type { WriteTransaction } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { SpendContext } from '../types';
import { getSettleOrderState } from './get-settle-order-state';

// Runs a settle in one write transaction. A settle that rolls back gives back the place it claimed,
// so facts read before it can still settle.
export async function withSettleTransaction<T>(
  context: SpendContext,
  fn: (tx: WriteTransaction) => Promise<T>,
): Promise<T> {
  const state = getSettleOrderState(context);
  let settledBefore: number | null = null;

  try {
    return await withWriteTransaction(context.log.writer, (tx) => {
      settledBefore = state.settled;

      return fn(tx);
    });
  } catch (error) {
    if (settledBefore !== null) {
      state.settled = settledBefore;
    }

    throw error;
  }
}
