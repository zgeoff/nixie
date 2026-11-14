import { withWriteTransaction } from '@heynixie/log';
import type { MemoryTables, VersionRef } from '../types';
import type { MemoryItemRequest } from './create-memory-item';
import type { MemorySeederDeps } from './memory-seeder-deps';
import { seedMemoryItem } from './seed-memory-item';

export async function seedMemoryItemWithoutShortID(
  deps: MemorySeederDeps,
  input: Partial<MemoryItemRequest> = {},
): Promise<VersionRef> {
  const item = await seedMemoryItem(deps, input);

  // An item that an earlier release wrote before items held short IDs: remember always writes one.
  await withWriteTransaction(deps.log.writer, (tx) =>
    tx
      .$extendTables<MemoryTables>()
      .updateTable('memory_items')
      .set({ short_id: null })
      .where('item_id', '=', item.itemID)
      .execute(),
  );

  return item;
}
