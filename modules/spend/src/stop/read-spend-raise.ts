import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

export interface SpendRaise {
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
  readonly by: string;
}

export async function readSpendRaise(
  db: Kysely<unknown>,
  start: string,
): Promise<SpendRaise | null> {
  const [row] = await readQueryRows(
    sql`select dollars, tokens, turns, raised_by from spend_raises where start = ${start}`,
    db,
    z.object({
      dollars: z.number(),
      tokens: z.number(),
      turns: z.number(),
      raised_by: z.string(),
    }),
  );

  return row === undefined
    ? null
    : { dollars: row.dollars, tokens: row.tokens, turns: row.turns, by: row.raised_by };
}
