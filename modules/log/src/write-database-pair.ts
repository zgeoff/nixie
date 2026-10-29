import { join } from 'node:path';
import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { DataFile } from './data-files';
import type { DataStorage } from './data-storage';

export interface DatabasePairOptions {
  readonly storage: DataStorage;
  readonly dataDir: string;
  readonly directory: string;
  readonly onCopied: (file: DataFile) => Promise<void> | void;
}

const maxAttempts = 5;

export async function writeDatabasePair(options: DatabasePairOptions): Promise<number> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const consistent = await writeCopies(options);

    if (consistent) {
      return attempt;
    }
  }

  throw new Error(`nixie wrote keys.db during each of ${String(maxAttempts)} copies`);
}

// The writer creates a record key before the record that uses it, and commits a forget before it
// removes the key. So a keys.db copy taken after the nixie.db copy, with no commit to keys.db from
// before the one to after the other, holds the key of every record the nixie.db copy keeps.
async function writeCopies(options: DatabasePairOptions): Promise<boolean> {
  const keys = options.storage.startDatabase(join(options.dataDir, 'keys.db'), { readonly: true });

  try {
    const before = await readDataVersion(keys);

    await writeLogCopy(options);

    await options.onCopied('nixie.db');
    await options.storage.writeDatabaseCopy(keys, join(options.directory, 'keys.db'));

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

async function writeLogCopy(options: DatabasePairOptions): Promise<void> {
  const db = options.storage.startDatabase(join(options.dataDir, 'nixie.db'), { readonly: true });

  try {
    await options.storage.writeDatabaseCopy(db, join(options.directory, 'nixie.db'));
  } finally {
    await db.destroy();
  }
}
