import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function startKeyStore(
  dataDir: string,
  busyTimeoutMs?: number,
): Promise<Kysely<unknown>> {
  const keys = startDatabase(join(dataDir, 'keys.db'), { secureDelete: true, busyTimeoutMs });

  try {
    // The store takes no migrations, because a copy taken before a migration would keep every key
    // deleted after it.
    await sql`create table if not exists record_keys (
      key_id text primary key,
      wrapped blob not null
    ) strict`.execute(keys);

    return keys;
  } catch (error) {
    await keys.destroy();

    throw error;
  }
}
