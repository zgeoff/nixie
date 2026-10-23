import { join } from 'node:path';
import { DatabaseError, readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { claimBackupLock } from './claim-backup-lock';
import { claimWriterLock } from './claim-writer-lock';
import type { DataFile } from './data-files';
import { dataFiles } from './data-files';
import type { DataRefusal } from './data-refusal';
import type { DataStorage } from './data-storage';
import { requireDataFiles } from './require-data-files';
import { writeRestoreState } from './write-restore-state';

export interface DataRestoreOptions {
  readonly storage: DataStorage;
  readonly dataDir: string;
  readonly directory: string;
}

export interface DataRestore {
  readonly files: readonly DataFile[];
}

// The writer lock refuses the restore while a server runs on the data directory, and keeps a
// server from starting until the restore ends.
export async function restoreDataBackup(
  options: DataRestoreOptions,
): Promise<DataRestore | DataRefusal> {
  const writerLock = claimWriterLock(options.dataDir, options.storage.claimFileLock);

  try {
    const backupLock = await claimBackupLock(options.storage, options.dataDir, 'exclusive');

    if (backupLock === null) {
      return { refused: 'backup-running' };
    }

    try {
      await requireDataFiles(
        options.storage.files,
        options.directory,
        `the backup in ${options.directory}`,
      );

      for (const file of dataFiles) {
        await requireIntactDatabase(options, file);
      }

      await writeStagedFiles(options);
      await replaceDataFiles(options);

      return { files: dataFiles };
    } finally {
      backupLock.release();
    }
  } finally {
    writerLock.release();
  }
}

async function requireIntactDatabase(options: DataRestoreOptions, file: DataFile): Promise<void> {
  const problems = await readIntegrityProblems(options.storage, join(options.directory, file));

  if (problems.length > 0) {
    throw new Error(
      `the ${file} in ${options.directory} fails its integrity check: ${problems.join('; ')}`,
    );
  }
}

const integritySchema = z.object({ integrity_check: z.string() });

async function readIntegrityProblems(
  storage: DataStorage,
  path: string,
): Promise<readonly string[]> {
  const db = storage.startDatabase(path, { readonly: true });

  try {
    const rows = await readQueryRows(sql`pragma integrity_check`, db, integritySchema);

    return rows.map((row) => row.integrity_check).filter((line) => line !== 'ok');
  } catch (error) {
    if (!(error instanceof DatabaseError)) {
      throw error;
    }

    return [error.message];
  } finally {
    await db.destroy();
  }
}

const stagedSuffix = '.restoring';

// Both copies land on the data directory's own filesystem before either replaces its database, so
// a full volume or an I/O error stops the restore before it removes anything.
async function writeStagedFiles(options: DataRestoreOptions): Promise<void> {
  const files = options.storage.files;

  try {
    for (const file of dataFiles) {
      const staged = join(options.dataDir, `${file}${stagedSuffix}`);

      await files.copyFile(join(options.directory, file), staged);
      await files.writeFileToDisk(staged);
    }
  } catch (error) {
    await Promise.all(
      dataFiles.map((file) => files.removeFile(join(options.dataDir, `${file}${stagedSuffix}`))),
    );

    // The CLI logs an error's message alone, so the filesystem's reason has to sit in it.
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`nixie cannot stage the backup in ${options.dataDir}: ${reason}`, {
      cause: error,
    });
  }
}

// The marker reaches the disk before the first database moves and leaves only after the last, so a
// restore that stops between the two leaves a pair the server refuses to start on. A WAL file left
// beside a restored database would replay the old database's commits onto it.
async function replaceDataFiles(options: DataRestoreOptions): Promise<void> {
  const files = options.storage.files;

  await writeRestoreState(files, options.dataDir, 'replacing');

  for (const file of dataFiles) {
    const path = join(options.dataDir, file);

    await files.removeFile(`${path}-wal`);
    await files.removeFile(`${path}-shm`);
    await files.renameFile(`${path}${stagedSuffix}`, path);
  }

  await files.writeDirectoryToDisk(options.dataDir);

  await writeRestoreState(files, options.dataDir, 'none');
}
