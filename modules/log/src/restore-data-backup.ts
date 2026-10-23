import { copyFile, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseError, readQueryRows, startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { claimWriterLock } from './claim-writer-lock';
import type { DataFile } from './data-files';
import { dataFiles } from './data-files';
import { requireDataFiles } from './require-data-files';

export interface DataRestoreOptions {
  readonly dataDir: string;
  readonly directory: string;
}

export interface DataRestore {
  readonly files: readonly DataFile[];
}

// The writer lock refuses the restore while a server runs on the data directory, and keeps a
// server from starting until the restore ends.
export async function restoreDataBackup(options: DataRestoreOptions): Promise<DataRestore> {
  const lock = claimWriterLock(options.dataDir);

  try {
    await requireDataFiles(options.directory, `the backup in ${options.directory}`);

    for (const file of dataFiles) {
      await requireIntactDatabase(options.directory, file);
    }

    await writeStagedFiles(options);
    await replaceDataFiles(options.dataDir);

    return { files: dataFiles };
  } finally {
    lock.release();
  }
}

async function requireIntactDatabase(directory: string, file: DataFile): Promise<void> {
  const problems = await readIntegrityProblems(join(directory, file));

  if (problems.length > 0) {
    throw new Error(
      `the ${file} in ${directory} fails its integrity check: ${problems.join('; ')}`,
    );
  }
}

const integritySchema = z.object({ integrity_check: z.string() });

async function readIntegrityProblems(path: string): Promise<readonly string[]> {
  const db = startDatabase(path, { readonly: true });

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
  try {
    for (const file of dataFiles) {
      const staged = join(options.dataDir, `${file}${stagedSuffix}`);

      await copyFile(join(options.directory, file), staged);
      await writePathToDisk(staged);
    }
  } catch (error) {
    await Promise.all(
      dataFiles.map((file) =>
        rm(join(options.dataDir, `${file}${stagedSuffix}`), { force: true, recursive: true }),
      ),
    );

    throw new Error(`nixie cannot stage the backup in ${options.dataDir}`, { cause: error });
  }
}

async function writePathToDisk(path: string): Promise<void> {
  const handle = await open(path, 'r');

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// A WAL file left beside a restored database would replay the old database's commits onto it.
async function replaceDataFiles(dataDir: string): Promise<void> {
  for (const file of dataFiles) {
    const path = join(dataDir, file);

    await rm(`${path}-wal`, { force: true });
    await rm(`${path}-shm`, { force: true });
    await rename(`${path}${stagedSuffix}`, path);
  }

  await writePathToDisk(dataDir);
}
