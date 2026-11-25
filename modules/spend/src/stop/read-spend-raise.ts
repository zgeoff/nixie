import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

export interface SpendRaise {
  readonly turns: number;
  readonly by: string;
}

// The raise of the day's turns. A raise from before the routes also holds dollars and tokens, which
// no limit reads any more.
export async function readSpendRaise(
  db: Kysely<unknown>,
  start: string,
): Promise<SpendRaise | null> {
  const [row] = await readQueryRows(
    sql`select turns, raised_by from spend_raises where start = ${start}`,
    db,
    z.object({ turns: z.number(), raised_by: z.string() }),
  );

  return row === undefined ? null : { turns: row.turns, by: row.raised_by };
}
