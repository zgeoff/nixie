import type { ErasureHandle } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ItemErasureRequest } from '../item/erasure/build-item-erasable';
import type { MemoryTables, RetiredForgetRequest, StoreParts } from '../types';
import { requireItem } from '../utils/item/require-item';
import { runItemForgets } from './run-item-forgets';

// Runs the forget of each retired item to its end. Every target is checked in the first start
// transaction, so a stale target leaves the whole request unbegun.
export async function runForgetRetired(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  request: RetiredForgetRequest,
): Promise<void> {
  const itemIDs = request.targets.map((target) => target.itemID);

  invariant(itemIDs.length > 0 && new Set(itemIDs).size === itemIDs.length);

  await runItemForgets(parts, erasure, {
    provenance: request.provenance,
    writeInTransaction: request.writeInTransaction,
    validate: async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      for (const target of request.targets) {
        await requireItem(db, { target, operation: 'forget', states: ['retired'] });
      }
    },
    readRequests: () =>
      Promise.resolve(
        request.targets.map((target) => ({
          itemID: target.itemID,
          revision: target.version,
          states: ['retired'],
        })),
      ),
  });
}
