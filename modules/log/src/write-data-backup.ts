import { dirname, join } from 'node:path';
import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { claimBackupLock } from './claim-backup-lock';
import type { DataFile } from './data-files';
import { dataFiles } from './data-files';
import type { DataStorage } from './data-storage';
import { getRestoreMarkerPath } from './get-restore-marker-path';
import { requireDataFiles } from './require-data-files';

export interface DataBackupOptions {
  readonly storage: DataStorage;
  readonly dataDir: string;
  readonly directory: string;
  readonly onCopied: (file: DataFile) => Promise<void> | void;
}

export interface DataBackup {
  readonly files: readonly DataFile[];
  readonly attempts: number;
}

const maxAttempts = 5;

export async function writeDataBackup(options: DataBackupOptions): Promise<DataBackup> {
  await requireDataFiles(
    options.storage.files,
    options.dataDir,
    `the data directory ${options.dataDir}`,
  );

  const lock = await claimBackupLock(options.storage, options.dataDir, 'shared');

  try {
    await requireFinishedRestore(options);
    await createBackupDirectory(options);

    await options.storage.files.createDirectories(getCopyingPath(options.directory));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const consistent = await writeCopies(options);

      if (consistent) {
        await publishCopies(options);

        return { files: dataFiles, attempts: attempt };
      }
    }

    throw new Error(`nixie wrote keys.db during each of ${String(maxAttempts)} copies`);
  } finally {
    lock.release();
  }
}

async function requireFinishedRestore(options: DataBackupOptions): Promise<void> {
  const restoring = await options.storage.files.probeFile(getRestoreMarkerPath(options.dataDir));

  if (restoring) {
    throw new Error(
      `a restore of the data directory ${options.dataDir} stopped before it finished, so nixie backs up nothing`,
    );
  }
}

// Creating the directory claims it, so a second backup into the same path stops before it copies.
async function createBackupDirectory(options: DataBackupOptions): Promise<void> {
  await options.storage.files.createDirectories(dirname(options.directory));

  const created = await options.storage.files.createDirectory(options.directory);

  if (!created) {
    throw new Error(
      `nixie backs up only into a directory it creates, and ${options.directory} exists`,
    );
  }
}

// A restore takes a backup only when it holds both databases, so copies that wait here until they
// pass the check never reach a restore as a pair, even when the backup stops between two attempts.
function getCopyingPath(directory: string): string {
  return join(directory, '.copying');
}

// The writer creates a record key before the record that uses it, and commits a forget before it
// removes the key. So a keys.db copy taken after the nixie.db copy, with no commit to keys.db from
// before the one to after the other, holds the key of every record the nixie.db copy keeps.
async function writeCopies(options: DataBackupOptions): Promise<boolean> {
  const keys = options.storage.startDatabase(join(options.dataDir, 'keys.db'), { readonly: true });

  try {
    const before = await readDataVersion(keys);

    await writeLogCopy(options);

    await options.onCopied('nixie.db');

    await options.storage.writeDatabaseCopy(
      keys,
      join(getCopyingPath(options.directory), 'keys.db'),
    );

    const after = await readDataVersion(keys);

    await options.onCopied('keys.db');

    return before === after;
  } finally {
    await keys.destroy();
  }
}

const dataVersionSchema = z.object({ data_version: z.number() });

async function readDataVersion(db: Kysely<unknown>): Promise<number> {
  const [row] = await readQueryRows(sql`pragma data_version`, db, dataVersionSchema);

  invariant(row, 'SQLite answers pragma data_version with one row');

  return row.data_version;
}

async function writeLogCopy(options: DataBackupOptions): Promise<void> {
  const db = options.storage.startDatabase(join(options.dataDir, 'nixie.db'), { readonly: true });

  try {
    await options.storage.writeDatabaseCopy(
      db,
      join(getCopyingPath(options.directory), 'nixie.db'),
    );
  } finally {
    await db.destroy();
  }
}

async function publishCopies(options: DataBackupOptions): Promise<void> {
  const files = options.storage.files;
  const copying = getCopyingPath(options.directory);

  for (const file of dataFiles) {
    await files.renameFile(join(copying, file), join(options.directory, file));
  }

  await files.writeToDisk(options.directory);
  await files.removeFile(copying);
}
