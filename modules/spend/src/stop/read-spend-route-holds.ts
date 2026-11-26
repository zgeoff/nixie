import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

export interface SpendRouteHold {
  readonly taskID: string;
  readonly sinceMs: number;
}

// The tasks that wait on the route, with the time of the record that held each
export async function readSpendRouteHolds(
  db: Kysely<unknown>,
  route: string,
): Promise<SpendRouteHold[]> {
  const rows = await readQueryRows(
    sql`select spend_route_holds.task_id, records.recorded_at from spend_route_holds
      join records on records.sequence = spend_route_holds.updated_sequence
      where spend_route_holds.route_id = ${route} order by spend_route_holds.task_id`,
    db,
    z.object({ task_id: z.string(), recorded_at: z.number() }),
  );

  return rows.map((row) => ({ taskID: row.task_id, sinceMs: row.recorded_at }));
}
