import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { checkMigrations } from './check-migrations';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-check-migrations-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it allows a new table, an optional column and an index after the last release', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text)`.execute(tx);
          },
        },
        {
          name: 'add titles and tags',
          up: async (tx) => {
            await sql`alter table notes add column title text not null default ''`.execute(tx);
            await sql`alter table notes add column subtitle text`.execute(tx);
            await sql`create index notes_by_title on notes (title)`.execute(tx);
            await sql`create table tags (note_id text not null, tag text not null)`.execute(tx);
            await sql`create unique index tags_by_note on tags (note_id, tag)`.execute(tx);
            await sql`alter table tags add column weight integer check (weight > 0)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    {
      migrations: ['create notes'],
      oldestReader: 0,
      objects: [
        { type: 'table', name: 'notes', tableName: 'notes', sql: 'CREATE TABLE notes (id text)' },
      ],
    },
    ctx.dir,
  );

  expect(check).toStrictEqual({
    changed: [],
    changedObjects: [],
    added: [{ version: 2, name: 'add titles and tags', refused: [] }],
    readableByReleaseBefore: true,
  });
});

test('it refuses a drop and a rename that keep the schema readable by the release before', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key, body text)`.execute(tx);
          },
        },
        {
          name: 'reshape notes',
          up: async (tx) => {
            await sql`alter table notes drop column body`.execute(tx);
            await sql`alter table notes rename to entries`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    {
      migrations: ['create notes'],
      oldestReader: 0,
      objects: [
        { type: 'index', name: 'sqlite_autoindex_notes_1', tableName: 'notes', sql: null },
        {
          type: 'table',
          name: 'notes',
          tableName: 'notes',
          sql: 'CREATE TABLE notes (id text primary key, body text)',
        },
      ],
    },
    ctx.dir,
  );

  expect(check.added).toStrictEqual([
    {
      version: 2,
      name: 'reshape notes',
      refused: ['alter table notes drop column body', 'alter table notes rename to entries'],
    },
  ]);
});

test('it refuses a column or a unique index on a released table that an old insert can fail', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text)`.execute(tx);
          },
        },
        {
          name: 'constrain notes',
          up: async (tx) => {
            await sql`alter table notes add column title text not null`.execute(tx);
            await sql`alter table notes add column rank integer check (rank > 0)`.execute(tx);
            await sql`create unique index notes_by_title on notes (title)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    {
      migrations: ['create notes'],
      oldestReader: 0,
      objects: [
        { type: 'table', name: 'notes', tableName: 'notes', sql: 'CREATE TABLE notes (id text)' },
      ],
    },
    ctx.dir,
  );

  expect(check.added).toStrictEqual([
    {
      version: 2,
      name: 'constrain notes',
      refused: [
        'alter table notes add column title text not null',
        'alter table notes add column rank integer check (rank > 0)',
        'create unique index notes_by_title on notes (title)',
      ],
    },
  ]);
});

test('it allows any statement when the build raises oldestReader past the last release', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key, body text)`.execute(tx);
          },
        },
        {
          name: 'drop the body',
          up: async (tx) => {
            await sql`alter table notes drop column body`.execute(tx);
          },
        },
      ],
      oldestReader: 2,
    },
    {
      migrations: ['create notes'],
      oldestReader: 0,
      objects: [
        { type: 'index', name: 'sqlite_autoindex_notes_1', tableName: 'notes', sql: null },
        {
          type: 'table',
          name: 'notes',
          tableName: 'notes',
          sql: 'CREATE TABLE notes (id text primary key, body text)',
        },
      ],
    },
    ctx.dir,
  );

  expect(check).toStrictEqual({
    changed: [],
    changedObjects: [],
    added: [{ version: 2, name: 'drop the body', refused: [] }],
    readableByReleaseBefore: false,
  });
});

test('it lists every migration and refuses none before the first release', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
            await sql`create trigger notes_frozen before delete on notes
              begin select raise(abort, 'notes are append-only'); end`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    null,
    ctx.dir,
  );

  expect(check).toStrictEqual({
    changed: [],
    changedObjects: [],
    added: [{ version: 1, name: 'create notes', refused: [] }],
    readableByReleaseBefore: true,
  });
});

test('it reports a released migration that the build renamed or removed', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create the notes table',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    {
      migrations: ['create notes', 'add titles'],
      oldestReader: 0,
      objects: [
        { type: 'index', name: 'sqlite_autoindex_notes_1', tableName: 'notes', sql: null },
        {
          type: 'table',
          name: 'notes',
          tableName: 'notes',
          sql: 'CREATE TABLE notes (id text primary key, title text)',
        },
      ],
    },
    ctx.dir,
  );

  expect(check.changed).toStrictEqual(['create notes', 'add titles']);
});

test('it reports each schema object that an edited released migration builds differently', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key, body text not null)`.execute(tx);
            await sql`create index notes_by_body on notes (body)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    {
      migrations: ['create notes'],
      oldestReader: 0,
      objects: [
        { type: 'index', name: 'sqlite_autoindex_notes_1', tableName: 'notes', sql: null },
        {
          type: 'table',
          name: 'notes',
          tableName: 'notes',
          sql: 'CREATE TABLE notes (id text primary key, body text)',
        },
      ],
    },
    ctx.dir,
  );

  expect(check.changedObjects).toStrictEqual(['notes', 'notes_by_body']);
});
