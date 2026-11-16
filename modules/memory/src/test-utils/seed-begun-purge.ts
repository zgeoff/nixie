import type { Log } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { writeEvidencePurgeStarted } from '../purge/write-evidence-purge-started';
import { recordForgetStartedCodec } from '../record/record-forget-started-codec';

export interface BegunPurge {
  // the record a record forget removed; null for a purge that no record forget owns
  readonly recordSequence: number | null;
  readonly itemIDs: readonly string[];
}

// Puts the log where a record forget leaves it after its first transaction: the forget began and
// the purge set is fixed. Nothing has run yet.
export async function seedBegunPurge(log: Log, begun: BegunPurge): Promise<void> {
  const definitions = { snapshotHash: 'sha256:test' };

  await withWriteTransaction(log.writer, async (tx) => {
    if (begun.recordSequence !== null) {
      await writeRecordsInTransaction(tx, log, [
        {
          kind: recordForgetStartedCodec.kind,
          definitions,
          thread: 'conversation',
          payload: recordForgetStartedCodec.encode({ recordSequence: begun.recordSequence }),
        },
      ]);
    }

    await writeEvidencePurgeStarted(tx, { log, definitions: () => definitions }, begun);
  });
}
