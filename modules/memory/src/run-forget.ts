import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { parseEvidence } from './parse-evidence';
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
      const db = tx.$extendTables<MemoryTables>();

      await requireItem(db, {
        target: request.target,
        operation: 'forget',
        states: ['active', 'retired'],
      });

      await writeRecordsInTransaction(tx, log, [
        {
          kind: 'memory.forget_started',
          definitions: parts.context.definitions(),
          ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
          payload: {
            itemID,
            version: request.target.version,
            evidenceSequences: await collectEvidenceSequences(db, itemID),
          },
        },
      ]);
    });

    await parts.index.remove(itemID);
  });

  await runForgetCleanup(parts, itemID);
}

// The messages that backed any version of the item or any proposal for it, by sequence, so a later
// write that cites one waits for review.
async function collectEvidenceSequences(
  db: Kysely<MemoryTables>,
  itemID: string,
): Promise<readonly number[]> {
  const versions = await db
    .selectFrom('memory_versions')
    .select(['evidence', 'intent_evidence'])
    .where('item_id', '=', itemID)
    .execute();

  const proposals = await db
    .selectFrom('memory_proposals')
    .select('evidence')
    .where('item_id', '=', itemID)
    .execute();

  const columns = [
    ...versions.flatMap((row) => [row.evidence, row.intent_evidence]),
    ...proposals.map((row) => row.evidence),
  ];

  return [
    ...new Set(columns.flatMap((column) => parseEvidence(column)?.recordSequence ?? [])),
  ].toSorted((left, right) => left - right);
}
