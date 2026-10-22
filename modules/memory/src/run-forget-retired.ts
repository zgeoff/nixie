import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readEvidenceSequences } from './read-evidence-sequences';
import { removeMessageEntries } from './remove-message-entries';
import { requireItem } from './require-item';
import { runForgetCleanup } from './run-forget-cleanup';
import type { MemoryTables, RetiredForgetRequest, StoreParts } from './types';

export async function runForgetRetired(
  parts: StoreParts,
  request: RetiredForgetRequest,
): Promise<void> {
  const log = parts.context.log;
  const itemIDs = request.targets.map((target) => target.itemID);

  invariant(itemIDs.length > 0 && new Set(itemIDs).size === itemIDs.length);

  await parts.lock(async () => {
    const evidenceSequences = await withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      await request.writeInTransaction?.(tx);

      for (const target of request.targets) {
        await requireItem(db, { target, operation: 'forget', states: ['retired'] });
      }

      const sequences = await Promise.all(
        itemIDs.map((itemID) => readEvidenceSequences(db, itemID)),
      );

      await writeRecordsInTransaction(
        tx,
        log,
        request.targets.map((target, index) => ({
          kind: 'memory.forget_started' as const,
          definitions: parts.context.definitions(),
          ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
          payload: {
            itemID: target.itemID,
            version: target.version,
            evidenceSequences: [...(sequences[index] ?? [])],
          },
        })),
      );

      return [...new Set(sequences.flat())];
    });

    for (const itemID of itemIDs) {
      await parts.index.remove(itemID);

      parts.vectors?.remove(itemID);
    }

    await removeMessageEntries(parts, evidenceSequences);
  });

  for (const itemID of itemIDs) {
    await runForgetCleanup(parts, itemID);
  }
}
