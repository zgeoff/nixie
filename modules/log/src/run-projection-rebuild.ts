import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { applyProjections } from './apply-projections';
import { buildEnvelopeRecord } from './build-envelope-record';
import type { Log, LogTables, Projection } from './types';
import { withWriteTransaction } from './with-write-transaction';

// Drops every projection row and folds the log again from the first record, in one write
// transaction, so no reader sees a half-built projection. A fold reads no erasable field, so a
// rebuild after a forget gives the rows the live fold gave.
export function runProjectionRebuild(log: Pick<Log, 'projections' | 'writer'>): Promise<void> {
  return withWriteTransaction(log.writer, async (tx) => {
    await resetProjections(tx, log.projections);
    await applyEveryRecord(tx, log.projections);
  });
}

async function resetProjections(
  tx: Transaction<unknown>,
  projections: readonly Projection[],
): Promise<void> {
  await tx.$extendTables<LogTables>().deleteFrom('projection_changes').execute();

  // a later projection may refer to an earlier one, so it empties first
  for (const projection of projections.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- in the order the references need
    await sql`delete from ${sql.table(projection.table)}`.execute(tx);
  }
}

async function applyEveryRecord(
  tx: Transaction<unknown>,
  projections: readonly Projection[],
): Promise<void> {
  const cursor = { after: 0, done: false };

  while (!cursor.done) {
    // oxlint-disable-next-line no-await-in-loop -- each page folds in sequence order
    const rows = await tx
      .$extendTables<LogTables>()
      .selectFrom('records')
      .selectAll()
      .where('sequence', '>', cursor.after)
      .orderBy('sequence')
      .limit(PAGE_SIZE)
      .execute();

    for (const row of rows) {
      // oxlint-disable-next-line no-await-in-loop -- a fold builds on the records before it
      await applyProjections(tx, projections, buildEnvelopeRecord(row));
    }
    cursor.after = rows.at(-1)?.sequence ?? cursor.after;
    cursor.done = rows.length < PAGE_SIZE;
  }
}

const PAGE_SIZE = 500;
