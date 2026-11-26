import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { buildSchemaBefore } from '../test-utils/build-schema-before';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { gapTablesMigration } from './0057-gap-tables-migration';
import { proposalsPromptFamilyMigration } from './0095-proposals-prompt-family-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-gap-tables-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: buildSchemaBefore(nixieSchema, proposalsPromptFamilyMigration),
    copyDir: directory,
  });

  return { db };
}

test('it is the migration of version 57', () => {
  expect(nixieSchema.migrations.indexOf(gapTablesMigration) + 1).toBe(57);
});

test('it creates the gap tables', async () => {
  const ctx = await setupTest();

  await sql`insert into gap_groups (group_hash) values ('group-1')`.execute(ctx.db);

  await sql`insert into gap_answers (proposal_id, group_hash, answer, answered_at, answered_sequence)
    values ('p-1', 'group-1', 'approved', 1000, 5)`.execute(ctx.db);

  const rows = await sql`select group_hash, answer from gap_answers`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ group_hash: 'group-1', answer: 'approved' }]);
});

test('it refuses an answer that is neither approved nor declined', async () => {
  const ctx = await setupTest();

  const insert =
    sql`insert into gap_answers (proposal_id, group_hash, answer, answered_at, answered_sequence)
    values ('p-1', 'group-1', 'lapsed', 1000, 5)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});
