import { withWriteTransaction } from '@heynixie/log';
import { requireItem } from './require-item';
import type { KeepRequest, MemoryTables, StoreParts } from './types';

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
