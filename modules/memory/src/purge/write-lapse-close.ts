import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { memoryEvidencePurgeClosedCodec } from '../record/memory-evidence-purge-closed-codec';
import type { StoreParts } from '../types';
import type { PurgeFacts } from './read-purge-facts';
import { writeProposalLapses } from './write-proposal-lapses';

// Closes the purge of a pending proposal for a new item. The proposal lapses, and the closing record
// names the item's key, so a retry that finds the record deletes the key and checks the key store
// again before it counts the purge as done. The caller holds the delivery lock.
export async function writeLapseClose(parts: StoreParts, facts: PurgeFacts): Promise<void> {
  const log = parts.context.log;

  await withWriteTransaction(log.writer, async (tx) => {
    await writeProposalLapses(tx, parts, facts);

    await writeRecordsInTransaction(tx, log, [
      {
        kind: memoryEvidencePurgeClosedCodec.kind,
        definitions: parts.context.definitions(),
        payload: memoryEvidencePurgeClosedCodec.encode({
          recordSequence: facts.recordSequence,
          itemID: facts.itemID,
          closedKeyIDs: [facts.itemID],
          closedRecordKeyIDs: [],
          generationKeyID: null,
          bridgeVersion: null,
          labelsRevision: null,
        }),
      },
    ]);
  });
}
