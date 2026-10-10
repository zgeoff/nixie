import { open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// Copies the open database to path with VACUUM INTO, a consistent snapshot even while others write.
// SQLite neither fsyncs the copy nor makes it atomic, so the copy goes to a temporary file, reaches
// the disk, and then takes its name, and an interrupted copy never sits under the final name.
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
