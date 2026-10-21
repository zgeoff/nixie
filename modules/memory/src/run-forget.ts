import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readEvidenceSequences } from './read-evidence-sequences';
import { removeMessageEntries } from './remove-message-entries';
import { requireItem } from './require-item';
import { runForgetCleanup } from './run-forget-cleanup';
import type { ForgetRequest, MemoryTables, StoreParts } from './types';

export async function runForget(parts: StoreParts, request: ForgetRequest): Promise<void> {
  const log = parts.context.log;
  const itemID = request.target.itemID;

  await parts.lock(async () => {
    const evidenceSequences = await withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      await request.writeInTransaction?.(tx);

      await requireItem(db, {
        target: request.target,
        operation: 'forget',
        states: ['active', 'retired'],
      });

      const sequences = await readEvidenceSequences(db, itemID);

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

    await removeMessageEntries(parts, evidenceSequences);
  });

  await runForgetCleanup(parts, itemID);
}
