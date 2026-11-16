import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { memoryEvidencePurgeClosedCodec } from '../record/memory-evidence-purge-closed-codec';
import type { StoreParts } from '../types';
import { removeClosedProposalKeys } from '../utils/key/remove-closed-proposal-keys';
import type { PurgeFacts } from './read-purge-facts';
import { buildLapseRecords } from './write-item-close';

// Closes the purge of a pending proposal for a new item. The proposal lapses, and the lapse deletes
// the item's key, so the closing record names no key. The caller holds the delivery lock.
export async function writeLapseClose(parts: StoreParts, facts: PurgeFacts): Promise<void> {
  const log = parts.context.log;

  await withWriteTransaction(log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, log, [
      ...buildLapseRecords(parts, facts),
      {
        kind: memoryEvidencePurgeClosedCodec.kind,
        definitions: parts.context.definitions(),
        payload: memoryEvidencePurgeClosedCodec.encode({
          recordSequence: facts.recordSequence,
          itemID: facts.itemID,
          closedKeyIDs: [],
          closedRecordKeyIDs: [],
          generationKeyID: null,
          bridgeVersion: null,
          labelsRevision: null,
        }),
      },
    ]);
  });

  await removeClosedProposalKeys(parts);
}
