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

test('it allows a new table, a new column and a new index after the last release', async () => {
  const ctx = await setupTest();

  const check = await checkMigrations(
    {
      migrations: [
        {
          name: 'create notes',
          up: async (tx) => {
            await sql`create table notes (id text primary key)`.execute(tx);
          },
        },
        {
          name: 'add titles and tags',
          up: async (tx) => {
            await sql`alter table notes add column title text not null default ''`.execute(tx);
            await sql`create table tags (note_id text not null, tag text not null)`.execute(tx);
            await sql`create unique index tags_by_note on tags (note_id, tag)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
    { migrations: ['create notes'], oldestReader: 0 },
    ctx.dir,
  );

  expect(check).toStrictEqual({
    changed: [],
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
    { migrations: ['create notes'], oldestReader: 0 },
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
    { migrations: ['create notes'], oldestReader: 0 },
    ctx.dir,
  );

  expect(check).toStrictEqual({
    changed: [],
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
    { migrations: ['create notes', 'add titles'], oldestReader: 0 },
    ctx.dir,
  );

  expect(check.changed).toStrictEqual(['create notes', 'add titles']);
});
