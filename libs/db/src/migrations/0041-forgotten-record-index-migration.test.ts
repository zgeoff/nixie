import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { buildSqliteWorkerDialect } from '../build-sqlite-worker-dialect';
import { nixieSchema } from '../nixie-schema';
import { runMigrations } from '../run-migrations';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { forgottenRecordIndexMigration } from './0041-forgotten-record-index-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();

  const directory = await mkdtemp(
    join(tmpdir(), `${prefix}nixie-forgotten-record-index-migration-`),
  );

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 41, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(forgottenRecordIndexMigration) + 1).toBe(41);
  expect(nixieSchema.oldestReader).toBe(35);
});

test('it answers a lookup of the records that a forget names from the index', async () => {
  const ctx = await setupTest();

  const plan = await sql`explain query plan
    select json_extract(payload, '$.recordSequence') as record_sequence
    from records
    where kind = 'record.forget_started'
      and json_extract(payload, '$.recordSequence') in (1, 2)`.execute(ctx.db);

  const details = z.array(z.object({ detail: z.string() })).parse(plan.rows);

  expect(details.map((row) => row.detail)).toContainEqual(
    expect.stringContaining('records_by_forgotten_sequence'),
  );
});
