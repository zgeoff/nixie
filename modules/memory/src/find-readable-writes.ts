import { findRecordKeys } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { StoreParts } from './types';
import type { GatedWrite } from './write-memory-batch';

// The writes of a batch whose cited source is still readable and backed no item forgotten since
// the gate ran, so a forget that completes while the checker answers still stops the write.
export async function findReadableWrites(
  parts: StoreParts,
  tx: Transaction<unknown>,
  writes: readonly GatedWrite[],
): Promise<readonly GatedWrite[]> {
  const readable = await readReadableSources(parts, tx, writes);
  const forgotten = await readForgottenSequences(tx, [...readable]);

  return writes.filter(
    (gated) =>
      readable.has(gated.write.sourceSequence) && !forgotten.has(gated.write.sourceSequence),
  );
}

interface SourceRow {
  readonly sequence: number;
  readonly key_id: string | null;
}

// Every cited source whose erasable fields still decrypt. A forget of a message deletes its key, so
// the source reads as gone here. The key store is a separate database, so a key deleted after this
// read and before the commit still publishes; no message forget exists yet to race it.
async function readReadableSources(
  parts: StoreParts,
  tx: Transaction<unknown>,
  writes: readonly GatedWrite[],
): Promise<ReadonlySet<number>> {
  const sequences = [...new Set(writes.map((gated) => gated.write.sourceSequence))];

  if (sequences.length === 0) {
    return new Set();
  }

  const rows: readonly SourceRow[] = await tx
    .$extendTables<{ records: SourceRow }>()
    .selectFrom('records')
    .select(['sequence', 'key_id'])
    .where('sequence', 'in', sequences)
    .execute();

  const keys = await findRecordKeys(
    parts.context.log,
    rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id])),
  );

  return new Set(
    rows
      .filter((row) => row.key_id !== null && (keys.get(row.key_id) ?? null) !== null)
      .map((row) => row.sequence),
  );
}
