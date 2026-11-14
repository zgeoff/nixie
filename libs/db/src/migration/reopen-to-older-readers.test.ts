import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from '../database/start-database';
import { nixieSchema } from '../schema/nixie-schema';
import { closeToOlderReaders } from './close-to-older-readers';
import { pauseMigrationVersion } from './pause-migration-version';
import { reopenToOlderReaders } from './reopen-to-older-readers';
import { runMigrations } from './run-migrations';

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

test('it restores the saved value', async () => {
  const ctx = await setupTest();

  await ctx.closeGate(pauseMigrationVersion);
  await ctx.db.transaction().execute((tx) => reopenToOlderReaders(tx));

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: 35, open_oldest_reader: null }]);
});

test('it changes nothing while the gate is open', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => reopenToOlderReaders(tx));

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: 35, open_oldest_reader: null }]);
});

test('it lets a schema older than the pause migration open again after the gate reopens', async () => {
  const ctx = await setupTest();

  const olderSchema = {
    migrations: nixieSchema.migrations.slice(0, pauseMigrationVersion - 1),
    oldestReader: 35,
  };

  await ctx.closeGate(pauseMigrationVersion);
  await ctx.db.transaction().execute((tx) => reopenToOlderReaders(tx));

  const accepted = await runMigrations(ctx.db, { schema: olderSchema, copyDir: ctx.directory });

  expect(accepted).toStrictEqual({
    from: nixieSchema.migrations.length,
    to: nixieSchema.migrations.length,
    copyPath: null,
  });
});
