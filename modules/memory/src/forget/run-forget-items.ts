import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type {
  MemoryTables,
  Provenance,
  StoreParts,
  VersionRef,
  WriteInTransaction,
} from '../types';
import { readEvidenceSequences } from '../utils/read-evidence-sequences';
import { runForgetCleanup } from './run-forget-cleanup';

export interface ForgetItems {
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction | undefined;

  readonly readTargets: (db: Kysely<MemoryTables>) => Promise<readonly VersionRef[]>;
}

export async function runForgetItems(
  parts: StoreParts,
  forget: ForgetItems,
): Promise<readonly string[]> {
  const log = parts.context.log;

  const itemIDs = await parts.lock(async () => {
    const begun = await withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();

      await forget.writeInTransaction?.(tx);

      const targets = await forget.readTargets(db);

      const sequences = await Promise.all(
        targets.map((target) => readEvidenceSequences(db, target.itemID)),
      );

      await writeRecordsInTransaction(
        tx,
        log,
        targets.map((target, index) => ({
          kind: 'memory.forget_started' as const,
          definitions: parts.context.definitions(),
          ...(forget.provenance.thread === undefined ? {} : { thread: forget.provenance.thread }),
          payload: {
            itemID: target.itemID,
            version: target.version,
            evidenceSequences: [...(sequences[index] ?? [])],
          },
        })),
      );

      return {
        itemIDs: targets.map((target) => target.itemID),
      };
    });

    for (const itemID of begun.itemIDs) {
      await parts.index.remove(itemID);

      parts.labels.remove(itemID);
      parts.vectors?.remove(itemID);

      await parts.triggers.remove(itemID);
    }

    return begun.itemIDs;
  });

  for (const itemID of itemIDs) {
    await runForgetCleanup(parts, itemID);
  }

  return itemIDs;
}
