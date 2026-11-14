import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from '../database/start-database';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSeeder } from '../test-utils/build-seeder';
import { closeToOlderReaders } from './close-to-older-readers';
import { pauseMigrationVersion } from './pause-migration-version';
import { removeTableRows } from './remove-table-rows';
import { runMigrations } from './run-migrations';
import { syncPauseGate } from './sync-pause-gate';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-reader-gate-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  // An oldest reader below the pause migration's version, so closing the gate shows in the stored
  // value whatever the build's own oldest reader is.
  const openReader = 35;
  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: { ...nixieSchema, oldestReader: openReader },
    copyDir: directory,
  });

  const readGate = async () => {
    const result = await sql`select oldest_reader, open_oldest_reader
      from schema_version`.execute(db);

    return result.rows;
  };

  const closeGate = (reader: number) =>
    db.transaction().execute((tx) => closeToOlderReaders(tx, reader));

  return { directory, db, openReader, readGate, closeGate, seed: buildSeeder(db) };
}

test('it reopens a closed gate when a log reset has emptied the pause', async () => {
  const ctx = await setupTest();

  await ctx.seed.record({ kind: 'nixie.paused' });
  await ctx.seed.nixiePause();
  await ctx.closeGate(pauseMigrationVersion);
  await ctx.db.transaction().execute((tx) => removeTableRows(tx, ['schema_version', 'records']));

  await syncPauseGate(ctx.db);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: ctx.openReader, open_oldest_reader: null }]);
});

test('it closes an open gate while nixie is paused', async () => {
  const ctx = await setupTest();

  await ctx.seed.record({ kind: 'nixie.paused' });
  await ctx.seed.nixiePause();

  await syncPauseGate(ctx.db);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([
    { oldest_reader: pauseMigrationVersion, open_oldest_reader: ctx.openReader },
  ]);
});

test('it does nothing on a schema with no pause table', async () => {
  const ctx = await setupTest();

  await sql`drop table nixie_pause`.execute(ctx.db);
  await ctx.closeGate(pauseMigrationVersion);

  await syncPauseGate(ctx.db);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([
    { oldest_reader: pauseMigrationVersion, open_oldest_reader: ctx.openReader },
  ]);
});
