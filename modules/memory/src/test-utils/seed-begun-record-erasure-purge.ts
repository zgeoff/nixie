import type { Log } from '@heynixie/log';
import {
  erasureStartedCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { writeEvidencePurgeStarted } from '../purge/write-evidence-purge-started';

interface BegunRecordErasure {
  readonly recordSequence: number;
  readonly itemIDs: readonly string[];
}

// Puts the log where an erasure of a record leaves it after its start: erasure.started names the
// record and the purge set is fixed. Nothing has run yet.
export async function seedBegunRecordErasurePurge(
  log: Log,
  begun: BegunRecordErasure,
): Promise<void> {
  const definitions = { snapshotHash: 'sha256:test' };

  await withWriteTransaction(log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, log, [
      {
        kind: erasureStartedCodec.kind,
        definitions,
        payload: erasureStartedCodec.encode({
          erasureID: `erasure-${String(begun.recordSequence)}`,
          kind: 'record',
          targetID: String(begun.recordSequence),
          shortID: null,
          version: null,
          parentID: null,
          by: 'user',
          capture: {
            keys: { ids: [] },
            cleanupKeys: [],
            sandboxCallIDs: [],
            purges: [{ recordSequence: begun.recordSequence, itemIDs: [...begun.itemIDs] }],
            sessionCause: { recordSequence: begun.recordSequence },
            turnInputs: { threads: [], cleaned: true, floor: begun.recordSequence },
          },
          keyCount: 0,
        }),
      },
    ]);

    await writeEvidencePurgeStarted(tx, { log, definitions: () => definitions }, begun);
  });
}
