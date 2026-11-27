import type { ErasureHandle } from '@heynixie/log';
import type { ItemErasureRequest } from '../item/erasure/build-item-erasable';
import type { ForgetStatus, MemoryTables, StoreParts } from '../types';
import { readForgetStatus } from '../utils/read-forget-status';

// Runs every step after the start for each item that has an open erasure, then reports where each
// item stands. It throws when a step fails, and a retry picks up where it stopped.
export async function runBegunForgets(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  itemIDs: readonly string[],
): Promise<ForgetStatus> {
  for (const itemID of itemIDs) {
    await erasure.finish(itemID);
  }

  return readForgetStatus(parts.context.log.writer.db.$extendTables<MemoryTables>(), itemIDs);
}
