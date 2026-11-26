import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

// Each provider's raise of the day, in US dollars, by provider ID
export async function readSpendProviderRaises(
  db: Kysely<unknown>,
  start: string,
): Promise<Readonly<Record<string, number>>> {
  const rows = await readQueryRows(
    sql`select provider_id, dollars from spend_provider_raises where start = ${start}`,
    db,
    z.object({ provider_id: z.string(), dollars: z.number() }),
  );

  return Object.fromEntries(rows.map((row) => [row.provider_id, row.dollars]));
}
