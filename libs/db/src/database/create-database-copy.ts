import { open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// SQLite's VACUUM INTO neither fsyncs the copy nor makes it atomic, so the copy is synced under a
// temporary name before it takes the final one.
export async function createDatabaseCopy(db: Kysely<unknown>, path: string): Promise<void> {
  const temporaryPath = `${path}.partial`;

  await rm(temporaryPath, { force: true });

  await sql`vacuum into ${temporaryPath}`.execute(db);

  await writePathToDisk(temporaryPath);
  await rename(temporaryPath, path);
  await writePathToDisk(dirname(path));
}

async function writePathToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
