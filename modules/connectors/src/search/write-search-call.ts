import type { WriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import type { SearchTables } from './search-tables';

export interface SearchCall {
  // the local date, such as 2026-11-07
  readonly day: string;
  readonly cap: number;
}

// Reads whether the day's count is under the cap, and writes nothing.
export async function probeSearchCallRoom(
  tx: WriteTransaction,
  call: SearchCall,
): Promise<boolean> {
  const row = await tx
    .$extendTables<SearchTables>()
    .selectFrom('search_calls')
    .select('count')
    .where('day', '=', call.day)
    .executeTakeFirst();

  return (row?.count ?? 0) < call.cap;
}

// Counts one call on the day. The guard keeps the count at the cap even if a caller skips the check.
export async function writeSearchCall(tx: WriteTransaction, call: SearchCall): Promise<void> {
  const countedRow = await tx
    .$extendTables<SearchTables>()
    .insertInto('search_calls')
    .values({ day: call.day, count: 1 })
    .onConflict((conflict) =>
      conflict
        .column('day')
        .doUpdateSet({ count: sql`count + 1` })
        .where('search_calls.count', '<', call.cap),
    )
    .returning('count')
    .executeTakeFirst();

  invariant(
    countedRow !== undefined,
    `the search call of ${call.day} passed the check, then capped`,
  );
}
