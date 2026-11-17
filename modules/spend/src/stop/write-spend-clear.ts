import { withWriteTransaction } from '@heynixie/log';
import type { SpendContext } from '../types';
import type { ClearReason } from './pick-spend-move';
import { writeSpendClearInTransaction } from './write-spend-clear-in-transaction';

export function writeSpendClear(context: SpendContext, reason: ClearReason): Promise<boolean> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeSpendClearInTransaction(tx, context, reason),
  );
}
