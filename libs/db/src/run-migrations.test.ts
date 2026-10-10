import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';
import type { BuildSchema } from './types';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-migrations-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = startDatabase(join(dir, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { dir, db };
}

test('it runs each pending migration and records the schema it writes and its oldest reader', async () => {
  const ctx = await setupTest();

  const report = await runMigrations(ctx.db, {
    schema: {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
        {
          name: 'add a title',
          up: async (tx) => {
            await sql`alter table notes add column title text not null default ''`.execute(tx);
          },
        },
      ],
      oldestReader: 1,
    },
    copyDir: ctx.dir,
  });

  const stored = await sql`select version, oldest_reader from schema_version`.execute(ctx.db);
  const columns = await sql`select name from pragma_table_info('notes')`.execute(ctx.db);

  expect(report).toStrictEqual({ from: 0, to: 2, copyPath: null });
  expect(stored.rows).toStrictEqual([{ version: 2, oldest_reader: 1 }]);
  expect(columns.rows).toStrictEqual([{ name: 'id' }, { name: 'title' }]);
});

test('it rolls back a failed migration together with its schema version', async () => {
  const ctx = await setupTest();

  const run = runMigrations(ctx.db, {
    schema: {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
        {
          name: 'create tags, then fail',
          up: async (tx) => {
            await sql`create table tags (id text primary key)`.execute(tx);
            throw new Error('the migration failed');
          },
        },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
  });

  await run.catch(() => {});

  const stored = await sql`select version from schema_version`.execute(ctx.db);
  const tables =
    await sql`select name from sqlite_schema where type = 'table' order by name`.execute(ctx.db);

  expect(run).rejects.toThrowWithMessage(Error, 'the migration failed');
  expect(stored.rows).toStrictEqual([{ version: 1 }]);
  expect(tables.rows).toStrictEqual([{ name: 'notes' }, { name: 'schema_version' }]);
});

test('it copies the database with VACUUM INTO before the first migration of a release', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, {
    schema: {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
  });
  await sql`insert into notes (id) values ('n1')`.execute(ctx.db);

  const report = await runMigrations(ctx.db, {
    schema: {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
        {
          name: 'create tags',
          up: async (tx) => {
            await sql`create table tags (id text primary key)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
  });

  const copy = new Database(join(ctx.dir, 'nixie-schema-1.db'), { readonly: true });

  onTestFinished(() => {
    copy.close();
  });

  expect(report).toStrictEqual({ from: 1, to: 2, copyPath: join(ctx.dir, 'nixie-schema-1.db') });
  expect(copy.query('select version from schema_version').all()).toStrictEqual([{ version: 1 }]);
  expect(copy.query('select id from notes').all()).toStrictEqual([{ id: 'n1' }]);
});

test('it takes no copy of a database that holds no schema yet', async () => {
  const ctx = await setupTest();

  const report = await runMigrations(ctx.db, {
    schema: {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
  });

  expect(report.copyPath).toBeNull();
  const names = await readdir(ctx.dir);

  expect(names.toSorted()).toStrictEqual(['nixie.db', 'nixie.db-shm', 'nixie.db-wal']);
});

test('it takes no copy when no migration is pending', async () => {
  const ctx = await setupTest();

  const schema: BuildSchema = {
    migrations: [
      {
        name: 'create notes',
        up: async (tx) => {
          await sql`create table notes (id text primary key)`.execute(tx);
        },
      },
    ],
    oldestReader: 0,
  };

  await runMigrations(ctx.db, { schema, copyDir: ctx.dir });

  const report = await runMigrations(ctx.db, { schema, copyDir: ctx.dir });

  expect(report).toStrictEqual({ from: 1, to: 1, copyPath: null });
  const names = await readdir(ctx.dir);

  expect(names.toSorted()).toStrictEqual(['nixie.db', 'nixie.db-shm', 'nixie.db-wal']);
});

test('it refuses a schema newer than the build reads, and names the copy to restore', async () => {
  const ctx = await setupTest();

  await sql`create table schema_version (id integer primary key, version integer not null,
    oldest_reader integer not null)`.execute(ctx.db);
  await sql`insert into schema_version (id, version, oldest_reader) values (1, 3, 3)`.execute(
    ctx.db,
  );
  await writeFile(join(ctx.dir, 'nixie-schema-1.db'), '');
  await writeFile(join(ctx.dir, 'nixie-schema-2.db'), '');

  const run = runMigrations(ctx.db, {
    schema: {
      migrations: [
        { name: 'one', up: () => Promise.resolve() },
        { name: 'two', up: () => Promise.resolve() },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
  });

  await run.catch(() => {});

  expect(run).rejects.toThrowWithMessage(
    Error,
    `database schema 3 needs a build that writes schema 3 or later, and this build writes schema 2: restore ${join(ctx.dir, 'nixie-schema-2.db')}, the copy taken before an upgrade`,
  );
});

test('it tells a refused build to restore a backup when no older copy exists', async () => {
  const ctx = await setupTest();

  await sql`create table schema_version (id integer primary key, version integer not null,
    oldest_reader integer not null)`.execute(ctx.db);
  await sql`insert into schema_version (id, version, oldest_reader) values (1, 3, 3)`.execute(
    ctx.db,
  );

  const run = runMigrations(ctx.db, {
    schema: { migrations: [{ name: 'one', up: () => Promise.resolve() }], oldestReader: 0 },
    copyDir: ctx.dir,
  });

  await run.catch(() => {});

  expect(run).rejects.toThrowWithMessage(
    Error,
    `database schema 3 needs a build that writes schema 3 or later, and this build writes schema 1: no copy of schema 1 or older sits in ${ctx.dir}, so restore a backup`,
  );
});

test('it opens a newer schema that the build can still read, and leaves it as it is', async () => {
  const ctx = await setupTest();

  await sql`create table schema_version (id integer primary key, version integer not null,
    oldest_reader integer not null)`.execute(ctx.db);
  await sql`insert into schema_version (id, version, oldest_reader) values (1, 3, 2)`.execute(
    ctx.db,
  );

  const report = await runMigrations(ctx.db, {
    schema: {
      migrations: [
        { name: 'one', up: () => Promise.resolve() },
        { name: 'two', up: () => Promise.resolve() },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
  });

  const stored = await sql`select version, oldest_reader from schema_version`.execute(ctx.db);

  expect(report).toStrictEqual({ from: 3, to: 3, copyPath: null });
  expect(stored.rows).toStrictEqual([{ version: 3, oldest_reader: 2 }]);
});

test('it runs the writer check first in every transaction and applies nothing when it fails', async () => {
  const ctx = await setupTest();

  const run = runMigrations(ctx.db, {
    schema: {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    copyDir: ctx.dir,
    requireWriter: () => Promise.reject(new Error('stale writer')),
  });

  await run.catch(() => {});

  const tables = await sql`select name from sqlite_schema where type = 'table'`.execute(ctx.db);

  expect(run).rejects.toThrowWithMessage(Error, 'stale writer');
  expect(tables.rows).toStrictEqual([]);
});
