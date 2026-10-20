import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { skillExportsMigration } from './skill-exports-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-exports-migration-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 20', () => {
  expect(nixieSchema.migrations.indexOf(skillExportsMigration) + 1).toBe(20);
});

test('it keeps each export row when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files)
    values ('skill-a', 'tide-tables', '{}', '{"SKILL.md":"# Tides"}')`.execute(ctx.db);

  await sql`insert into written_skills (approval_id, proposal_id, name, skill_hash, state,
    approved_at, updated_at)
    values ('approval-a', 'k3vq8m2xpa', 'tide-tables', 'skill-a', 'in_force', 1, 1)`.execute(
    ctx.db,
  );

  await sql`insert into skill_exports (approval_id, state, base_hash, pull_request_number,
    pull_request_url, updated_at)
    values ('approval-a', 'opened', null, 7, 'https://github.test/pull/7', 2)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => skillExportsMigration.up(tx));

  const rows = await sql`select approval_id, state from skill_exports`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ approval_id: 'approval-a', state: 'opened' }]);
});

test('it refuses an export of no skill that nixie wrote', async () => {
  const ctx = await setupTest();

  const refused = await sql`insert into skill_exports (approval_id, state, base_hash,
    pull_request_number, pull_request_url, updated_at)
    values ('approval-a', 'opened', null, 7, 'https://github.test/pull/7', 2)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
