import { readRecordKeys } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { StoreParts } from './types';
import type { GatedWrite } from './write-memory-batch';
import type { StagedFlag } from './writer-types';

export interface ReadableWrites {
  readonly writes: readonly GatedWrite[];
  readonly flags: readonly StagedFlag[];
}

// The writes and flags of a batch whose cited source is still readable and backed no item
// forgotten since the gate ran, so a forget that completes while the checker answers still stops
// the write, and a flag never quotes a forgotten message.
export async function filterReadableWrites(
  parts: StoreParts,
  tx: Transaction<unknown>,
  batch: ReadableWrites,
): Promise<ReadableWrites> {
  const sequences = [
    ...batch.writes.map((gated) => gated.write.sourceSequence),
    ...batch.flags.map((flag) => flag.sourceSequence),
  ];

  const readable = await readReadableSources(parts, tx, sequences);
  const forgotten = await readForgottenSequences(tx, [...readable]);

  const isReadable = (sequence: number): boolean =>
    readable.has(sequence) && !forgotten.has(sequence);

  return {
    writes: batch.writes.filter((gated) => isReadable(gated.write.sourceSequence)),
    flags: batch.flags.filter((flag) => isReadable(flag.sourceSequence)),
  };
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
  cited: readonly number[],
): Promise<ReadonlySet<number>> {
  const sequences = [...new Set(cited)];

  if (sequences.length === 0) {
    return new Set();
  }

  const rows: readonly SourceRow[] = await tx
    .$extendTables<{ records: SourceRow }>()
    .selectFrom('records')
    .select(['sequence', 'key_id'])
    .where('sequence', 'in', sequences)
    .execute();

  const keys = await readRecordKeys(
    parts.context.log,
    rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id])),
  );

  return new Set(
    rows
      .filter((row) => row.key_id !== null && (keys.get(row.key_id) ?? null) !== null)
      .map((row) => row.sequence),
  );
}
