import { onTestFinished } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';

export interface KeyStoreReader {
  // ends the read, so a checkpoint can move every frame out of the WAL
  readonly release: () => Promise<void>;
}

// Opens a second connection on the key store in the data directory and holds a read on it, as
// another process's reader would, so a key store checkpoint cannot finish until the test releases
// it. The connection closes when the test finishes.
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
