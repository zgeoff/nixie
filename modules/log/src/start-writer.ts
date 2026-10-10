import { statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { BuildSchema } from '@heynixie/db';
import { nixieSchema, runMigrations, startDatabase } from '@heynixie/db';
import { claimWriterEpoch } from './claim-writer-epoch';
import { claimWriterLock } from './claim-writer-lock';
import { requireLocalFilesystem } from './require-local-filesystem';
import { requireWriterEpoch } from './require-writer-epoch';
import type { ReadFilesystemType, Writer } from './types';

export interface StartWriterOptions {
  // the volume's mount root, which holds nixie.db and the key store
  readonly dataDir: string;
  readonly schema?: BuildSchema;
  readonly readFilesystemType?: ReadFilesystemType;
}

// Makes this process the database's one writer, in the order a release on the host needs: refuse a
// network filesystem, take the writer lock, raise the writer epoch, then copy and migrate the
// database. Any failure releases what the start took.
export async function startWriter(options: StartWriterOptions): Promise<Writer> {
  requireLocalFilesystem(options.dataDir, options.readFilesystemType ?? statfsSync);
  const lock = claimWriterLock(options.dataDir);
  const db = startDatabase(join(options.dataDir, 'nixie.db'));

  try {
    const epoch = await claimWriterEpoch(db);
    const migration = await runMigrations(db, {
      schema: options.schema ?? nixieSchema,
      copyDir: options.dataDir,
      requireWriter: (tx) => requireWriterEpoch(tx, epoch),
    });

    return { db, epoch, migration, stop: () => stopWriter(db, lock) };
  } catch (error) {
    await stopWriter(db, lock);
    throw error;
  }
}

async function stopWriter(
  db: Writer['db'],
  lock: ReturnType<typeof claimWriterLock>,
): Promise<void> {
  try {
    await db.destroy();
  } finally {
    lock.release();
  }
}
