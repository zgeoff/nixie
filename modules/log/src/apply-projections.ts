import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { EnvelopeRecord, LogTables, Projection } from './types';

// Folds one record into every projection, inside the record's own transaction, and writes each
// changed row as it stands after the record, so a reader gets the rows as of that record.
export async function applyProjections(
  tx: Transaction<unknown>,
  projections: readonly Projection[],
  record: EnvelopeRecord,
): Promise<void> {
  for (const projection of projections) {
    // oxlint-disable-next-line no-await-in-loop -- one projection may read what another folded
    const folded = await projection.fold(tx, record);
    const keys = [...new Set(folded)];

    if (keys.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- the rows as this projection left them
      await writeChanges(tx, projection, { sequence: record.sequence, keys });
    }
  }
}

interface FoldedKeys {
  readonly sequence: number;
  readonly keys: readonly string[];
}

async function writeChanges(
  tx: Transaction<unknown>,
  projection: Projection,
  folded: FoldedKeys,
): Promise<void> {
  const result = await sql<Record<string, unknown>>`select * from ${sql.table(projection.table)}
    where ${sql.ref(projection.keyColumn)} in (${sql.join(folded.keys)})`.execute(tx);
  const rows = new Map(result.rows.map((row) => [String(row[projection.keyColumn]), row]));

  await tx
    .$extendTables<LogTables>()
    .insertInto('projection_changes')
    .values(
      folded.keys.map((key) => ({
        sequence: folded.sequence,
        projection: projection.table,
        row_key: key,
        row: encodeRow(rows.get(key)),
      })),
    )
    .execute();
}

function encodeRow(row: Readonly<Record<string, unknown>> | undefined): string | null {
  return row === undefined ? null : JSON.stringify(row);
}
