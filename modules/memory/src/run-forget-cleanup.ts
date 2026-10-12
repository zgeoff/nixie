import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { MemoryTables, StoreParts } from './types';

// Finishes a forget that memory.forget_started began: it deletes and checkpoints the item's key,
// drops the index entry, runs the session cleanup and commits memory.forgotten. Every step is safe
// to run again, so a forget that a crash cut short resumes here and completes.
export async function runForgetCleanup(parts: StoreParts, itemID: string): Promise<void> {
  const log = parts.context.log;

  await removeRecordKey(log, itemID);
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: itemID });
  }
  await parts.index.remove(itemID);
  await parts.context.cleanupSessions(itemID);
  await withWriteTransaction(log.writer, async (tx) => {
    const item = await tx
      .$extendTables<MemoryTables>()
      .selectFrom('memory_items')
      .select('state')
      .where('item_id', '=', itemID)
      .executeTakeFirst();

    if (item?.state !== 'forgetting') {
      return;
    }
    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.forgotten',
        definitions: parts.context.definitions(),
        payload: { itemID },
      },
    ]);
  });
}
