import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createDatabaseCopy, readQueryRows, startDatabase } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { DataFile } from './data-files';
import { dataFiles } from './data-files';
import { requireDataFiles } from './require-data-files';

export interface DataBackupOptions {
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
  await requireDataFiles(options.dataDir, `the data directory ${options.dataDir}`);
  await createEmptyDirectory(options.directory);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const consistent = await writeCopies(options);

    if (consistent) {
      return { files: dataFiles, attempts: attempt };
    }
  }

  throw new Error(`nixie wrote keys.db during each of ${String(maxAttempts)} copies`);
}

async function createEmptyDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const entries = await readdir(directory);

  if (entries.length > 0) {
    throw new Error(`nixie backs up only into an empty directory, and ${directory} is not empty`);
  }
}

// The writer creates a record key before the record that uses it, and commits a forget before it
// removes the key. So a keys.db copy taken after the nixie.db copy, with no commit to keys.db from
// before the one to after the other, holds the key of every record the nixie.db copy keeps.
async function writeCopies(options: DataBackupOptions): Promise<boolean> {
  const keys = startDatabase(join(options.dataDir, 'keys.db'), { readonly: true });

  try {
    const before = await readDataVersion(keys);

    await writeLogCopy(options);

    await options.onCopied('nixie.db');

    await createDatabaseCopy(keys, join(options.directory, 'keys.db'));

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
  const db = startDatabase(join(options.dataDir, 'nixie.db'), { readonly: true });

  try {
    await createDatabaseCopy(db, join(options.directory, 'nixie.db'));
  } finally {
    await db.destroy();
  }
}
