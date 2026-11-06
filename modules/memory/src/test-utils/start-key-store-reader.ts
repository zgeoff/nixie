import { onTestFinished } from 'bun:test';
import { startDatabase } from '@heynixie/db';
import { getDataFilePath } from '@heynixie/log';
import { sql } from 'kysely';

export interface KeyStoreReader {
  readonly release: () => Promise<void>;
}

export async function startKeyStoreReader(dataDir: string): Promise<KeyStoreReader> {
  const reader = startDatabase(getDataFilePath(dataDir, 'keys.db'));

  onTestFinished(() => reader.destroy());

  await sql`begin`.execute(reader);
  await sql`select count(*) from record_keys`.execute(reader);

  return {
    release: async () => {
      await sql`commit`.execute(reader);
    },
  };
}
