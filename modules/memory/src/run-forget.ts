import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireItem } from './require-item';
import { runForgetCleanup } from './run-forget-cleanup';
import type { ForgetRequest, MemoryTables, StoreParts } from './types';

// Forgets one item for good, bound to the version the confirmation showed. Under the delivery lock
// it commits memory.forget_started, which stops every later recall from delivering the item, and
// drops the item from the index. The cleanup then deletes the key and finishes the forget.
export async function runForget(parts: StoreParts, request: ForgetRequest): Promise<void> {
  const log = parts.context.log;
  const itemID = request.target.itemID;

  await parts.lock(async () => {
    await withWriteTransaction(log.writer, async (tx) => {
      await requireItem(tx.$extendTables<MemoryTables>(), {
        target: request.target,
        operation: 'forget',
        states: ['active', 'retired'],
      });
      await writeRecordsInTransaction(tx, log, [
        {
          kind: 'memory.forget_started',
          definitions: parts.context.definitions(),
          ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
          payload: { itemID, version: request.target.version },
        },
      ]);
    });
    await parts.index.remove(itemID);
  });
  await runForgetCleanup(parts, itemID);
}
