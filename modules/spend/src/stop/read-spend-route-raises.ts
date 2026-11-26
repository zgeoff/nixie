import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// Each route's raise of the day, in US dollars, by route ID
export async function readSpendRouteRaises(
  db: Kysely<unknown>,
  start: string,
): Promise<Readonly<Record<string, number>>> {
  const rows = await readQueryRows(
    sql`select route_id, dollars from spend_route_raises where start = ${start}`,
    db,
    z.object({ route_id: z.string(), dollars: z.number() }),
  );

  return Object.fromEntries(rows.map((row) => [row.route_id, row.dollars]));
}
