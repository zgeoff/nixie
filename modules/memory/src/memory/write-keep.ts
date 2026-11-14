import { withWriteTransaction } from '@heynixie/log';
import type { KeepRequest, MemoryTables, StoreParts } from '../types';
import { requireItem } from '../utils/item/require-item';

export async function writeKeep(parts: StoreParts, request: KeepRequest): Promise<void> {
  await withWriteTransaction(parts.context.log.writer, async (tx) => {
    await request.writeInTransaction(tx);

    await requireItem(tx.$extendTables<MemoryTables>(), {
      target: request.target,
      operation: 'keep',
      states: ['active', 'retired'],
    });
  });
}
