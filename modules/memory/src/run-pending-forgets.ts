import { runForgetCleanup } from './run-forget-cleanup';
import type { MemoryTables, StoreParts } from './types';

// Resumes every forget that a crash or a failure left pending, before the store serves a recall.
export async function runPendingForgets(parts: StoreParts): Promise<void> {
  const pending = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('state', '=', 'forgetting')
    .orderBy('updated_sequence')
    .execute();

  for (const item of pending) {
    await runForgetCleanup(parts, item.item_id);
  }
}
