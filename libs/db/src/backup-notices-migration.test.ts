import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { backupNoticesMigration } from './backup-notices-migration';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-backup-notices-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 38', () => {
  expect(nixieSchema.migrations.indexOf(backupNoticesMigration) + 1).toBe(38);
});

test('it keeps one notice of each cause for a set', async () => {
  const ctx = await setupTest();

  await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
    values (4, 'scheduled', 'failed', 30, 1798761600000)`.execute(ctx.db);

  await sql`insert into backup_notices (sequence, cause, raised_at)
    values (4, 'missing', 1798765200000), (4, 'failed', 1798768800000)`.execute(ctx.db);

  const rows = await sql`select * from backup_notices order by raised_at`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { sequence: 4, cause: 'missing', raised_at: 1_798_765_200_000 },
    { sequence: 4, cause: 'failed', raised_at: 1_798_768_800_000 },
  ]);
});

test('it refuses a second notice of the same cause for a set', async () => {
  const ctx = await setupTest();

  await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
    values (4, 'scheduled', 'failed', 30, 1798761600000)`.execute(ctx.db);

  await sql`insert into backup_notices (sequence, cause, raised_at)
    values (4, 'failed', 1798765200000)`.execute(ctx.db);

  const refused = await sql`insert into backup_notices (sequence, cause, raised_at)
    values (4, 'failed', 1798768800000)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ message: expect.stringContaining('UNIQUE constraint failed') });
});

test.each([
  ['cause', 4, 'late'],
  ['sequence', 9, 'failed'],
])(
  'it refuses a notice whose %s names nothing the backup sets hold',
  async (_column, sequence, cause) => {
    const ctx = await setupTest();

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
    values (4, 'scheduled', 'failed', 30, 1798761600000)`.execute(ctx.db);

    const refused = await sql`insert into backup_notices (sequence, cause, raised_at)
    values (${sequence}, ${cause}, 1798765200000)`
      .execute(ctx.db)
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(refused).toMatchObject({ message: expect.stringContaining('constraint failed') });
  },
);
