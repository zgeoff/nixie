import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { applyProjections } from './apply-projections';
import { buildEnvelopeRecord } from './build-envelope-record';
import type { Log, LogTables, Projection } from './types';
import { withWriteTransaction } from './with-write-transaction';

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

  for (const projection of projections.toReversed()) {
    await sql`delete from ${sql.table(projection.table)}`.execute(tx);
  }
}

const PAGE_SIZE = 500;

async function applyEveryRecord(
  tx: Transaction<unknown>,
  projections: readonly Projection[],
): Promise<void> {
  const cursor = { after: 0, done: false };

  while (!cursor.done) {
    const rows = await tx
      .$extendTables<LogTables>()
      .selectFrom('records')
      .selectAll()
      .where('sequence', '>', cursor.after)
      .orderBy('sequence')
      .limit(PAGE_SIZE)
      .execute();

    for (const row of rows) {
      await applyProjections(tx, projections, buildEnvelopeRecord(row));
    }

    cursor.after = rows.at(-1)?.sequence ?? cursor.after;
    cursor.done = rows.length < PAGE_SIZE;
  }
}
