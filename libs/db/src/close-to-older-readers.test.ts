import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { closeToOlderReaders } from './close-to-older-readers';
import { nixieSchema } from './nixie-schema';
import { pauseMigrationVersion } from './pause-migration-version';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-reader-gate-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  const readGate = async () => {
    const result = await sql`select oldest_reader, open_oldest_reader
      from schema_version`.execute(db);

    return result.rows;
  };

  const closeGate = (reader: number) =>
    db.transaction().execute((tx) => closeToOlderReaders(tx, reader));

  return { directory, db, readGate, closeGate };
}

test('it saves the open value and raises the stored one', async () => {
  const ctx = await setupTest();

  await ctx.closeGate(pauseMigrationVersion);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: pauseMigrationVersion, open_oldest_reader: 35 }]);
});

test('it keeps the first saved value when called twice', async () => {
  const ctx = await setupTest();

  await ctx.closeGate(pauseMigrationVersion);
  await ctx.closeGate(pauseMigrationVersion);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: pauseMigrationVersion, open_oldest_reader: 35 }]);
});
