import { runForgetCleanup } from './run-forget-cleanup';
import type { MemoryTables, StoreParts } from './types';

// Runs the cleanup of the item's forget again while the forget is pending, so a forget whose
// cleanup failed completes. An item no forget began keeps its key, and a completed forget has
// nothing left to run.
export async function runBegunForget(parts: StoreParts, itemID: string): Promise<void> {
  const item = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('state')
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  if (item?.state === 'forgetting') {
    await runForgetCleanup(parts, itemID);
  }
}
