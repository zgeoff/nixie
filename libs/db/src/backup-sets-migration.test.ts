import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { backupSetsMigration } from './backup-sets-migration';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-backup-sets-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 31, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(backupSetsMigration) + 1).toBe(31);
  expect(nixieSchema.oldestReader).toBeLessThan(31);
});

test('it keeps a staged set with no receipt yet', async () => {
  const ctx = await setupTest();

  await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
    values (1, 'scheduled', 'staged', 12, 1798761600000)`.execute(ctx.db);

  const rows = await sql`select * from backup_sets`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      sequence: 1,
      kind: 'scheduled',
      state: 'staged',
      log_head: 12,
      staged_at: 1_798_761_600_000,
      received_at: null,
      data_snapshot_id: null,
      key_snapshot_id: null,
      receipt: null,
    },
  ]);
});

test('it refuses a set in a state the stager never writes', async () => {
  const ctx = await setupTest();

  const refused = await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
    values (1, 'scheduled', 'uploading', 12, 1798761600000)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});

test('it refuses a kind the stager never writes', async () => {
  const ctx = await setupTest();

  const refused = await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
    values (1, 'manual', 'staged', 12, 1798761600000)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
