import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { SchemaTooNewError } from '../schema/schema-too-new-error';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { erasureTargetIndexMigration } from './0102-erasure-target-index-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-erasure-target-index-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  return {
    db,
    upgrade: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    startPreviousRelease: () =>
      runMigrations(db, {
        schema: { migrations: nixieSchema.migrations.slice(0, 101), oldestReader: 0 },
        copyDir: directory,
      }),
  };
}

test('it registers as migration 102, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(erasureTargetIndexMigration) + 1).toBe(102);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(102);
});

test('it refuses to open the upgraded database to the release before it', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const run = ctx.startPreviousRelease();

  await Promise.allSettled([run]);

  expect(run).rejects.toBeInstanceOf(SchemaTooNewError);
});

test('it answers a lookup of the targets that an erasure names from the index', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const plan = await sql`explain query plan
    select json_extract(payload, '$.targetID') as target_id
    from records
    where kind = 'erasure.started'
      and json_extract(payload, '$.targetID') in ('1', '2')`.execute(ctx.db);

  const details = z.array(z.object({ detail: z.string() })).parse(plan.rows);

  expect(details.map((row) => row.detail)).toContainEqual(
    expect.stringContaining('records_by_erasure_target'),
  );
});
