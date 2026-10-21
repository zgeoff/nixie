import { runForgetCleanup } from './run-forget-cleanup';
import type { MemoryTables, StoreParts } from './types';

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
