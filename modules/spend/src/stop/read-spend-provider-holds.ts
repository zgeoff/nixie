import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { SpendRouteHold } from './read-spend-route-holds';

// The tasks that wait on the provider, with the time of the record that held each
export async function readSpendProviderHolds(
  db: Kysely<unknown>,
  provider: string,
): Promise<SpendRouteHold[]> {
  const rows = await readQueryRows(
    sql`select spend_provider_holds.task_id, records.recorded_at from spend_provider_holds
      join records on records.sequence = spend_provider_holds.updated_sequence
      where spend_provider_holds.provider_id = ${provider} order by spend_provider_holds.task_id`,
    db,
    z.object({ task_id: z.string(), recorded_at: z.number() }),
  );

  return rows.map((row) => ({ taskID: row.task_id, sinceMs: row.recorded_at }));
}
