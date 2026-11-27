import type { ErasureHandle } from '@heynixie/log';
import type { ItemErasureRequest } from '../item/erasure/build-item-erasable';
import type { AllForgetRequest, MemoryTables, StoreParts } from '../types';
import { runItemForgets } from './run-item-forgets';

// Runs the forget of every active and retired item to its end, and returns their IDs.
export function runForgetAll(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  request: AllForgetRequest,
): Promise<readonly string[]> {
  return runItemForgets(parts, erasure, {
    provenance: request.provenance,
    readRequests: async () => {
      const rows = await parts.context.log.writer.db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_items')
        .select('item_id')
        .where('state', 'in', ['active', 'retired'])
        .orderBy('created_sequence')
        .execute();

      return rows.map((row) => ({
        itemID: row.item_id,
        revision: null,
        states: ['active', 'retired'],
      }));
    },
  });
}
