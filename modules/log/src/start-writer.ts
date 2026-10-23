import { statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { BuildSchema } from '@heynixie/db';
import { nixieSchema, runMigrations, startDatabase } from '@heynixie/db';
import { claimWriterEpoch } from './claim-writer-epoch';
import { claimWriterLock } from './claim-writer-lock';
import { localDataStorage } from './local-data-storage';
import { readRestoreState } from './read-restore-state';
import { requireLocalFilesystem } from './require-local-filesystem';
import { requireWriterEpoch } from './require-writer-epoch';
import { startKeyStore } from './start-key-store';
import type { ReadFilesystemType, Writer } from './types';

export interface StartWriterOptions {
  readonly dataDir: string;
  readonly schema?: BuildSchema;
  readonly readFilesystemType?: ReadFilesystemType;

  readonly clock?: Clock;

  readonly keyStoreBusyTimeoutMs?: number | undefined;
}

export async function startWriter(options: StartWriterOptions): Promise<Writer> {
  requireLocalFilesystem(options.dataDir, options.readFilesystemType ?? statfsSync);

  const lock = claimWriterLock(options.dataDir);

  const restore = await readRestoreState(localDataStorage.files, options.dataDir);

  if (restore === 'replacing') {
    lock.release();

    throw new Error(
      `a restore of the data directory ${options.dataDir} stopped before it finished, so its databases may come from two backups; run nixie restore again`,
    );
  }

  const db = startDatabase(join(options.dataDir, 'nixie.db'));

  try {
    const epoch = await claimWriterEpoch(db);

    const migration = await runMigrations(db, {
      schema: options.schema ?? nixieSchema,
      copyDir: options.dataDir,
      requireWriter: (tx) => requireWriterEpoch(tx, epoch),
    });

    const keys = await startKeyStore(options.dataDir, options.keyStoreBusyTimeoutMs);

    return {
      dataDir: options.dataDir,
      db,
      keys,
      epoch,
      clock: options.clock ?? systemClock,
      commits: new EventTarget(),
      migration,
      stop: makeStopOnce([db, keys], lock),
    };
  } catch (error) {
    await stopWriter([db], lock);

    throw error;
  }
}

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
