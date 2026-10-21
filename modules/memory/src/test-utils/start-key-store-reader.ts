import { onTestFinished } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';

export interface KeyStoreReader {
  readonly release: () => Promise<void>;
}

export async function startKeyStoreReader(dataDir: string): Promise<KeyStoreReader> {
  const reader = startDatabase(join(dataDir, 'keys.db'));

  onTestFinished(() => reader.destroy());

  await sql`begin`.execute(reader);
  await sql`select count(*) from record_keys`.execute(reader);

  return {
    release: async () => {
      await sql`commit`.execute(reader);
    },
  };
}
