import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// Opens keys.db beside nixie.db, so a database backup holds only ciphertext. Secure delete wipes a
// deleted key from the free pages. The store has no migrations, because a copy taken before one
// would keep every key deleted after it.
export async function startKeyStore(dataDir: string): Promise<Kysely<unknown>> {
  const keys = startDatabase(join(dataDir, 'keys.db'), { secureDelete: true });

  try {
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
