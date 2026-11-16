import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { memoryEvidencePurgeStartedCodec } from '../record/memory-evidence-purge-started-codec';
import type { MemoryContext } from '../types';

export interface EvidencePurgeStart {
  // the record that a record forget removed; null for a purge that no record forget owns
  readonly recordSequence: number | null;
  readonly itemIDs: readonly string[];
}

// The one writer of the purge set. A record forget calls it in the transaction that writes
// record.forget_started.
export async function writeEvidencePurgeStarted(
  tx: Transaction<unknown>,
  context: Pick<MemoryContext, 'log' | 'definitions'>,
  started: EvidencePurgeStart,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: memoryEvidencePurgeStartedCodec.kind,
      definitions: context.definitions(),
      payload: memoryEvidencePurgeStartedCodec.encode({
        recordSequence: started.recordSequence,
        itemIDs: [...started.itemIDs],
      }),
    },
  ]);
}
