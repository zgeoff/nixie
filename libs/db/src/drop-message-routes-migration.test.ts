import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { dropMessageRoutesMigration } from './drop-message-routes-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-drop-message-routes-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(dropMessageRoutesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 35, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(dropMessageRoutesMigration) + 1).toBe(35);
  expect(nixieSchema.oldestReader).toBe(35);
});

test('it drops the message routes of a database it upgrades, rows and all', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'owner_message', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into message_routes (message_sequence, task_id, routed_sequence)
    values (1, 'k3x9m2p7qa', 1)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const tables =
    await sql`select name from sqlite_master where type = 'table' and name = 'message_routes'`.execute(
      ctx.db,
    );

  expect(tables.rows).toStrictEqual([]);
});

test('it keeps the records the message routes pointed at', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'owner_message', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into message_routes (message_sequence, task_id, routed_sequence)
    values (1, 'k3x9m2p7qa', 1)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const records = await sql`select sequence, kind from records`.execute(ctx.db);

  expect(records.rows).toStrictEqual([{ sequence: 1, kind: 'owner_message' }]);
});
