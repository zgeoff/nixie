import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// A route's stop that stands in the log, which the projection folds from the trips and the clears.
export interface SpendRouteStopRow {
  readonly route: string;
  readonly period: 'day' | 'month';
  readonly limit: number;
  readonly spent: number;
  readonly at: number;
  readonly resetsAt: number;
}

export async function readSpendRouteStops(db: Kysely<unknown>): Promise<SpendRouteStopRow[]> {
  const rows = await readQueryRows(
    sql`select route_id, period, limit_amount, spent_amount, at, resets_at from spend_route_stops order by route_id`,
    db,
    z.object({
      route_id: z.string(),
      period: z.enum(['day', 'month']),
      limit_amount: z.number(),
      spent_amount: z.number(),
      at: z.number(),
      resets_at: z.number(),
    }),
  );

  return rows.map((row) => ({
    route: row.route_id,
    period: row.period,
    limit: row.limit_amount,
    spent: row.spent_amount,
    at: row.at,
    resetsAt: row.resets_at,
  }));
}
