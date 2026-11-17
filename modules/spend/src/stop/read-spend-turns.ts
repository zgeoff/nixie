import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

export interface SpendTurns {
  readonly day: number;
  readonly month: number;
}

// The turns since the start of the day and of the month, summed from whole buckets.
export interface SpendStarts {
  readonly dayMs: number;
  readonly monthMs: number;
}

export async function readSpendTurns(
  db: Kysely<unknown>,
  starts: SpendStarts,
): Promise<SpendTurns> {
  const [row] = await readQueryRows(
    sql`select
        coalesce(sum(case when bucket_start >= ${starts.dayMs} then turns end), 0) as day,
        coalesce(sum(turns), 0) as month
      from spend_turns where bucket_start >= ${starts.monthMs}`,
    db,
    z.object({ day: z.number(), month: z.number() }),
  );

  return row ?? { day: 0, month: 0 };
}
