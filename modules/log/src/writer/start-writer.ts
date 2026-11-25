import { statfsSync } from 'node:fs';
import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { BuildSchema } from '@heynixie/db';
import { nixieSchema, runMigrations, startDatabase, syncPauseGate } from '@heynixie/db';
import { getDataFilePath } from '../data/get-data-file-path';
import { startKeyStore } from '../key/start-key-store';
import { claimWriterEpoch } from '../record/claim-writer-epoch';
import { logRecordTopics } from '../record/log-record-topics';
import { registerRecordTopics } from '../record/register-record-topics';
import type { PendingRestore } from '../restore/pending-restore';
import { readRestoreState } from '../restore/read-restore-state';
import type { ReadFilesystemType, Writer } from '../types';
import type { DataFileSystem } from '../utils/data-storage';
import { claimWriterLock } from './claim-writer-lock';
import { localDataStorage } from './local-data-storage';
import { requireLocalFilesystem } from './require-local-filesystem';
import { requireWriterEpoch } from './require-writer-epoch';

export interface StartWriterOptions {
  readonly dataDir: string;
  readonly schema?: BuildSchema;
  readonly readFilesystemType?: ReadFilesystemType;
  readonly files?: DataFileSystem;

  // Only the server passes true: a data directory that holds a finished restore starts for it alone.
  readonly installsRestorePause?: boolean;

  readonly clock?: Clock;

  readonly keyStoreBusyTimeoutMs?: number | undefined;
}

export async function startWriter(options: StartWriterOptions): Promise<Writer> {
  requireLocalFilesystem(options.dataDir, options.readFilesystemType ?? statfsSync);

  const lock = claimWriterLock(options.dataDir);
  let pendingRestore: PendingRestore | null = null;

  try {
    pendingRestore = await requireFinishedRestore(
      options.files ?? localDataStorage.files,
      options.dataDir,
      options.installsRestorePause === true,
    );
  } catch (error) {
    lock.release();
    throw error;
  }

  const db = startDatabase(getDataFilePath(options.dataDir, 'nixie.db'));

  try {
    const epoch = await claimWriterEpoch(db);

    const migration = await runMigrations(db, {
      schema: options.schema ?? nixieSchema,
      copyDir: options.dataDir,
      requireWriter: (tx) => requireWriterEpoch(tx, epoch),
    });

    await syncPauseGate(db);

    const keys = await startKeyStore(options.dataDir, options.keyStoreBusyTimeoutMs);

    const writer: Writer = {
      dataDir: options.dataDir,
      db,
      keys,
      epoch,
      pendingRestore,
      clock: options.clock ?? systemClock,
      commits: new EventTarget(),
      migration,
      stop: makeStopOnce([db, keys], lock),
    };

    registerRecordTopics(writer, logRecordTopics);

    return writer;
  } catch (error) {
    await stopWriter([db], lock);

    throw error;
  }
}

async function requireFinishedRestore(
  files: DataFileSystem,
  dataDir: string,
  installsRestorePause: boolean,
): Promise<PendingRestore | null> {
  const restore = await readRestoreState(files, dataDir);

  if (restore.state === 'replacing') {
    throw new Error(
      `a restore of the data directory ${dataDir} stopped before it finished, so its databases may come from two backups; run nixie restore again`,
    );
  }

  if (restore.state === 'holding') {
    if (!installsRestorePause) {
      throw new Error(
        `the data directory ${dataDir} holds a finished restore that only the server's start installs, so this process does not start on it`,
      );
    }

    return restore.pending;
  }

  return null;
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
