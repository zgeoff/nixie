import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// A provider's stop that stands in the log, which the projection folds from the trips and the clears
export interface SpendProviderStopRow {
  readonly provider: string;
  readonly routes: readonly string[];
  readonly period: 'day' | 'month';
  readonly limit: number;
  readonly spent: number;
  readonly at: number;
  readonly resetsAt: number;
}

const routesSchema = z.array(z.string());

export async function readSpendProviderStops(db: Kysely<unknown>): Promise<SpendProviderStopRow[]> {
  const rows = await readQueryRows(
    sql`select provider_id, period, limit_amount, spent_amount, at, resets_at, routes from spend_provider_stops order by provider_id`,
    db,
    z.object({
      provider_id: z.string(),
      period: z.enum(['day', 'month']),
      limit_amount: z.number(),
      spent_amount: z.number(),
      at: z.number(),
      resets_at: z.number(),
      routes: z.string(),
    }),
  );

  return rows.map((row) => ({
    provider: row.provider_id,
    routes: routesSchema.parse(JSON.parse(row.routes)),
    period: row.period,
    limit: row.limit_amount,
    spent: row.spent_amount,
    at: row.at,
    resetsAt: row.resets_at,
  }));
}
