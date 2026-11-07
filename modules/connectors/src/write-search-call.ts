import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import type { SearchTables } from './search-tables';

export interface SearchCall {
  // the local date, such as 2026-11-07
  readonly day: string;
  readonly cap: number;
}

export type SearchCallCount = 'counted' | 'capped';

// Counts one call on the day, unless the day's count already reached the cap. One statement checks
// and counts, so two calls at once never both take the last call under the cap.
export function writeSearchCall(
  log: Pick<Log, 'writer'>,
  call: SearchCall,
): Promise<SearchCallCount> {
  return withWriteTransaction(log.writer, async (tx) => {
    const counted = await tx
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

    return counted === undefined ? 'capped' : 'counted';
  });
}
