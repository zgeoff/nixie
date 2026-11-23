import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ForgetRequest, MemoryTables, StoreParts } from '../types';
import { requireItem } from '../utils/item/require-item';
import { readEvidenceSequences } from '../utils/read-evidence-sequences';
import { runForgetCleanup } from './run-forget-cleanup';

export async function runForget(parts: StoreParts, request: ForgetRequest): Promise<void> {
  const log = parts.context.log;
  const itemID = request.target.itemID;

  await parts.lock(async () => {
    await withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      await request.writeInTransaction?.(tx);

      const item = await requireItem(db, {
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
            version: item.version,
            evidenceSequences: [...sequences],
          },
        },
      ]);
    });

    await parts.index.remove(itemID);

    parts.labels.remove(itemID);
    parts.vectors?.remove(itemID);

    await parts.triggers.remove(itemID);
  });

  await runForgetCleanup(parts, itemID);
}
