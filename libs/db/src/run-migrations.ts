import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import { createDatabaseCopy } from './create-database-copy';
import { SchemaTooNewError } from './schema-too-new-error';
import type { BuildSchema, Migration, StoredSchema } from './types';

export interface RunMigrationsOptions {
  readonly schema: BuildSchema;

  // where the copy taken before the first migration goes, as nixie-schema-<version>.db
  readonly copyDir: string;

  // runs first in every transaction the runner opens, such as the writer epoch check
  readonly requireWriter?: (tx: Transaction<unknown>) => Promise<void>;
}

export interface MigrationReport {
  readonly from: number;
  readonly to: number;
  readonly copyPath: string | null;
}

// Brings the database to the schema this build writes, copying it first unless it holds no schema
// yet. A database newer than the build stays as it is when the build can read it, and is refused
// when it cannot.
export async function runMigrations(
  db: Kysely<unknown>,
  options: RunMigrationsOptions,
): Promise<MigrationReport> {
  const stored = await createSchemaVersion(db, options),
    writes = options.schema.migrations.length;

  if (stored.version >= writes) {
    await requireReadableSchema(stored, writes, options.copyDir);
    return { from: stored.version, to: stored.version, copyPath: null };
  }
  const copyPath = await createCopyBeforeMigration(db, stored.version, options.copyDir);

  for (const [index, migration] of options.schema.migrations.entries()) {
    if (index >= stored.version) {
      // oxlint-disable-next-line no-await-in-loop -- each migration builds on the one before it
      await runMigration(db, options, { index, migration });
    }
  }
  return { from: stored.version, to: writes, copyPath };
}

// The schema_version table predates every migration, because it records which migrations ran.
function createSchemaVersion(
  db: Kysely<unknown>,
  options: RunMigrationsOptions,
): Promise<StoredSchema> {
  return db.transaction().execute(async (tx) => {
    await options.requireWriter?.(tx);
    await sql`create table if not exists schema_version (
      id integer primary key check (id = 1),
      version integer not null,
      oldest_reader integer not null
    ) strict`.execute(tx);
    await sql`insert into schema_version (id, version, oldest_reader) values (1, 0, 0)
      on conflict do nothing`.execute(tx);
    const result = await sql<{ version: number; oldest_reader: number }>`
      select version, oldest_reader from schema_version where id = 1`.execute(tx),
      [row] = result.rows;

    if (row === undefined) {
      throw new Error('schema_version holds no row');
    }
    return { version: row.version, oldestReader: row.oldest_reader };
  });
}

async function requireReadableSchema(
  stored: StoredSchema,
  writes: number,
  copyDir: string,
): Promise<void> {
  if (writes >= stored.oldestReader) {
    return;
  }
  const restore = await findRestore(copyDir, writes);

  throw new SchemaTooNewError(stored, writes, restore);
}

async function findRestore(copyDir: string, writes: number): Promise<string> {
  const names = await readdir(copyDir),
    [newest] = names
      .map((name) => ({ name, version: parseCopyVersion(name) ?? Infinity }))
      .filter((copy) => copy.version <= writes)
      .toSorted((left, right) => right.version - left.version);

  if (newest === undefined) {
    return `no copy of schema ${writes} or older sits in ${copyDir}, so restore a backup`;
  }
  return `restore ${join(copyDir, newest.name)}, the copy taken before an upgrade`;
}

const COPY_NAME = /^nixie-schema-(?<version>\d+)\.db$/u;

function parseCopyVersion(name: string): number | null {
  const version = COPY_NAME.exec(name)?.groups?.['version'];

  return version === undefined ? null : Number(version);
}

// a database with no schema yet holds nothing to lose, so it gets no copy
async function createCopyBeforeMigration(
  db: Kysely<unknown>,
  version: number,
  copyDir: string,
): Promise<string | null> {
  if (version === 0) {
    return null;
  }
  const copyPath = join(copyDir, `nixie-schema-${version}.db`);

  await createDatabaseCopy(db, copyPath);
  return copyPath;
}

interface PendingMigration {
  readonly index: number;
  readonly migration: Migration;
}

function runMigration(
  db: Kysely<unknown>,
  options: RunMigrationsOptions,
  pending: PendingMigration,
): Promise<void> {
  return db.transaction().execute(async (tx) => {
    await options.requireWriter?.(tx);
    await pending.migration.up(tx);
    const result = await sql`update schema_version
      set version = ${pending.index + 1}, oldest_reader = ${options.schema.oldestReader}
      where id = 1 and version = ${pending.index}`.execute(tx);

    if (result.numAffectedRows !== 1n) {
      throw new Error(`schema_version moved during migration ${pending.migration.name}`);
    }
  });
}
