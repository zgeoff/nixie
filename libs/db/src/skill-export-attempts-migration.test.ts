import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { skillExportAttemptsMigration } from './skill-export-attempts-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-export-attempts-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(skillExportAttemptsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 21', () => {
  expect(nixieSchema.migrations.indexOf(skillExportAttemptsMigration) + 1).toBe(21);
});

test('it keeps each export row of a database it upgrades, and marks an export in flight', async () => {
  const ctx = await setupTest();

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files)
    values ('skill-a', 'tide-tables', '{}', '{"SKILL.md":"# Tides"}')`.execute(ctx.db);

  await sql`insert into written_skills (approval_id, proposal_id, name, skill_hash, state,
    approved_at, updated_at) values
    ('approval-a', 'k3vq8m2xpa', 'tide-tables', 'skill-a', 'retired', 1, 1),
    ('approval-b', 'w7tn4c9rhz', 'tide-tables', 'skill-a', 'in_force', 1, 1)`.execute(ctx.db);

  await sql`insert into skill_exports (approval_id, state, base_hash, pull_request_number,
    pull_request_url, updated_at)
    values ('approval-a', 'closed', null, 7, 'https://github.test/pull/7', 2)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into skill_export_attempts (approval_id, started_at)
    values ('approval-b', 3)`.execute(ctx.db);

  const exports = await sql`select * from skill_exports`.execute(ctx.db);
  const attempts = await sql`select * from skill_export_attempts`.execute(ctx.db);

  expect(exports.rows).toStrictEqual([
    {
      approval_id: 'approval-a',
      state: 'closed',
      base_hash: null,
      pull_request_number: 7,
      pull_request_url: 'https://github.test/pull/7',
      updated_at: 2,
    },
  ]);

  expect(attempts.rows).toStrictEqual([{ approval_id: 'approval-b', started_at: 3 }]);
});

test('it keeps each mark when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files)
    values ('skill-a', 'tide-tables', '{}', '{"SKILL.md":"# Tides"}')`.execute(ctx.db);

  await sql`insert into written_skills (approval_id, proposal_id, name, skill_hash, state,
    approved_at, updated_at)
    values ('approval-a', 'k3vq8m2xpa', 'tide-tables', 'skill-a', 'in_force', 1, 1)`.execute(
    ctx.db,
  );

  await sql`insert into skill_export_attempts (approval_id, started_at)
    values ('approval-a', 2)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => skillExportAttemptsMigration.up(tx));

  const rows = await sql`select * from skill_export_attempts`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ approval_id: 'approval-a', started_at: 2 }]);
});

test('it refuses a mark of no skill that nixie wrote', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const refused = await sql`insert into skill_export_attempts (approval_id, started_at)
    values ('approval-a', 2)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
