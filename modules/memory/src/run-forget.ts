import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { collectEvidenceSequences } from './collect-evidence-sequences';
import { removeMessageEntries } from './remove-message-entries';
import { requireItem } from './require-item';
import { runForgetCleanup } from './run-forget-cleanup';
import type { ForgetRequest, MemoryTables, StoreParts } from './types';

// Forgets one item for good, bound to the version the confirmation showed. Under the delivery lock
// it commits memory.forget_started, which stops every later recall from delivering the item, and
// drops the item and the messages that backed it from the indexes. The cleanup then deletes the key and finishes the forget.
export async function runForget(parts: StoreParts, request: ForgetRequest): Promise<void> {
  const log = parts.context.log;
  const itemID = request.target.itemID;

  await parts.lock(async () => {
    const evidenceSequences = await withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      // the caller's own write, such as a checked action's result, ends a settled retry first
      await request.writeInTransaction?.(tx);

      await requireItem(db, {
        target: request.target,
        operation: 'forget',
        states: ['active', 'retired'],
      });

      const sequences = await collectEvidenceSequences(db, itemID);

      await writeRecordsInTransaction(tx, log, [
        {
          kind: 'memory.forget_started',
          definitions: parts.context.definitions(),
          ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
          payload: {
            itemID,
            version: request.target.version,
            evidenceSequences: [...sequences],
          },
        },
      ]);

      return sequences;
    });

    await parts.index.remove(itemID);

    parts.vectors?.remove(itemID);

    // a message that backed the item would bring its words back through retrieval
    await removeMessageEntries(parts, evidenceSequences);
  });

  await runForgetCleanup(parts, itemID);
}
