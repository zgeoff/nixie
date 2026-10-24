import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { promptApprovalsMigration } from './prompt-approvals-migration';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-approvals-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 26', () => {
  expect(nixieSchema.migrations.indexOf(promptApprovalsMigration) + 1).toBe(26);
});

test('it refuses a second current approval of one prompt', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3vq8m2xpa', 'compaction', 'conversation', '{}', '[]', 'current', 1, 1)`.execute(
    ctx.db,
  );

  const refused = await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id,
    thread, entry, files, state, approved_at, updated_at)
    values ('approval-b', 'w7tn4c9rhz', 'compaction', 'conversation', '{}', '[]', 'current', 2, 2)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});

test('it keeps a current approval of one prompt beside a superseded one', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at) values
    ('approval-a', 'k3vq8m2xpa', 'compaction', null, '{}', '[]', 'superseded', 1, 2),
    ('approval-b', 'w7tn4c9rhz', 'compaction', null, '{}', '[]', 'current', 2, 2)`.execute(ctx.db);

  const rows =
    await sql`select approval_id, state from prompt_approvals order by approval_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { approval_id: 'approval-a', state: 'superseded' },
    { approval_id: 'approval-b', state: 'current' },
  ]);
});

test('it refuses an export of no approved prompt override', async () => {
  const ctx = await setupTest();

  const refused = await sql`insert into prompt_exports (approval_id, state, pull_request_number,
    pull_request_url, updated_at) values ('approval-a', 'opened', 7, 'https://github.test/pull/7', 2)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});

test('it keeps each row when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3vq8m2xpa', 'compaction', null, '{}', '[]', 'current', 1, 1)`.execute(
    ctx.db,
  );

  await sql`insert into prompt_export_attempts (approval_id, started_at)
    values ('approval-a', 2)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => promptApprovalsMigration.up(tx));

  const attempts = await sql`select * from prompt_export_attempts`.execute(ctx.db);

  expect(attempts.rows).toStrictEqual([{ approval_id: 'approval-a', started_at: 2 }]);
});
