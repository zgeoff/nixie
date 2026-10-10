import { statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { BuildSchema } from '@heynixie/db';
import { nixieSchema, runMigrations, startDatabase } from '@heynixie/db';
import { claimWriterEpoch } from './claim-writer-epoch';
import { claimWriterLock } from './claim-writer-lock';
import { requireLocalFilesystem } from './require-local-filesystem';
import { requireWriterEpoch } from './require-writer-epoch';
import { startKeyStore } from './start-key-store';
import type { ReadFilesystemType, Writer } from './types';

export interface StartWriterOptions {
  // the volume's mount root, which holds nixie.db and the key store
  readonly dataDir: string;
  readonly schema?: BuildSchema;
  readonly readFilesystemType?: ReadFilesystemType;
}

// Makes this process the database's one writer, in the order a release on the host needs: refuse a
// network filesystem, take the writer lock, raise the writer epoch, then copy and migrate the
// database, then open the key store beside it. Any failure releases what the start took.
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

    const keys = await startKeyStore(options.dataDir);

    return {
      dataDir: options.dataDir,
      db,
      keys,
      epoch,
      migration,
      stop: makeStopOnce([db, keys], lock),
    };
  } catch (error) {
    await stopWriter([db], lock);
    throw error;
  }
}

// a second stop waits for the first, because a stopped handle never answers another close
function makeStopOnce(
  handles: readonly Writer['db'][],
  lock: ReturnType<typeof claimWriterLock>,
): () => Promise<void> {
  const stopped: { pending: Promise<void> | null } = { pending: null };

  return () => {
    stopped.pending ??= stopWriter(handles, lock);
    return stopped.pending;
  };
}

async function stopWriter(
  handles: readonly Writer['db'][],
  lock: ReturnType<typeof claimWriterLock>,
): Promise<void> {
  try {
    await Promise.all(handles.map((handle) => handle.destroy()));
  } finally {
    lock.release();
  }
}
