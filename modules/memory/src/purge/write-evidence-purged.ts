import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildPurgeKey } from '../item-key/build-purge-key';
import { memoryEvidencePurgedCodec } from '../record/memory-evidence-purged-codec';
import type { MemoryTables, PurgeRequest, StoreParts } from '../types';

// The last mark of an item's purge. It writes nothing when the mark is there.
export function writeEvidencePurged(parts: StoreParts, request: PurgeRequest): Promise<void> {
  const log = parts.context.log;

  return withWriteTransaction(log.writer, async (tx) => {
    const purge = await tx
      .$extendTables<MemoryTables>()
      .selectFrom('memory_evidence_purges')
      .select('purged_sequence')
      .where('purge_key', '=', buildPurgeKey(request.recordSequence, request.itemID))
      .executeTakeFirst();

    if (purge === undefined || purge.purged_sequence !== null) {
      return;
    }

    await writeRecordsInTransaction(tx, log, [
      {
        kind: memoryEvidencePurgedCodec.kind,
        definitions: parts.context.definitions(),
        payload: memoryEvidencePurgedCodec.encode(request),
      },
    ]);
  });
}
