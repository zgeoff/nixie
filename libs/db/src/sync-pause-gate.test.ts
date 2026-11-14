import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { closeToOlderReaders } from './close-to-older-readers';
import { nixieSchema } from './nixie-schema';
import { pauseMigrationVersion } from './pause-migration-version';
import { removeTableRows } from './remove-table-rows';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';
import { syncPauseGate } from './sync-pause-gate';

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

  const insertPause = async () => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (1, 1, 'nixie.paused', 'h', '{}')`.execute(db);

    await sql`insert into nixie_pause (id, cause, paused_sequence)
      values (1, 'owner', 1)`.execute(db);
  };

  return { directory, db, readGate, closeGate, insertPause };
}

test('it reopens a closed gate when a log reset has emptied the pause', async () => {
  const ctx = await setupTest();

  await ctx.insertPause();
  await ctx.closeGate(pauseMigrationVersion);
  await ctx.db.transaction().execute((tx) => removeTableRows(tx, ['schema_version', 'records']));

  await syncPauseGate(ctx.db);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: 35, open_oldest_reader: null }]);
});

test('it closes an open gate while nixie is paused', async () => {
  const ctx = await setupTest();

  await ctx.insertPause();

  await syncPauseGate(ctx.db);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: pauseMigrationVersion, open_oldest_reader: 35 }]);
});

test('it does nothing on a schema with no pause table', async () => {
  const ctx = await setupTest();

  await sql`drop table nixie_pause`.execute(ctx.db);
  await ctx.closeGate(pauseMigrationVersion);

  await syncPauseGate(ctx.db);

  const gate = await ctx.readGate();

  expect(gate).toStrictEqual([{ oldest_reader: pauseMigrationVersion, open_oldest_reader: 35 }]);
});
