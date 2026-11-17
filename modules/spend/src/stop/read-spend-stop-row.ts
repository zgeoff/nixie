import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// The stop that stands in the log, which the projection folds from the trips and the clears.
export interface SpendStopRow {
  readonly reason: 'limit' | 'unreachable' | 'lost';
  readonly period: 'day' | 'month' | null;
  readonly measure: 'dollars' | 'tokens' | 'turns' | null;
  readonly resetsAt: number | null;
  readonly at: number;
  readonly limit: number | null;
  readonly spent: number | null;
}

export async function readSpendStopRow(db: Kysely<unknown>): Promise<SpendStopRow | null> {
  const [row] = await readQueryRows(
    sql`select reason, period, measure, limit_amount, spent_amount, at, resets_at from spend_stop`,
    db,
    z.object({
      reason: z.enum(['limit', 'unreachable', 'lost']),
      period: z.enum(['day', 'month']).nullable(),
      measure: z.enum(['dollars', 'tokens', 'turns']).nullable(),
      limit_amount: z.number().nullable(),
      spent_amount: z.number().nullable(),
      at: z.number(),
      resets_at: z.number().nullable(),
    }),
  );

  return row === undefined
    ? null
    : {
        reason: row.reason,
        period: row.period,
        measure: row.measure,
        resetsAt: row.resets_at,
        at: row.at,
        limit: row.limit_amount,
        spent: row.spent_amount,
      };
}
