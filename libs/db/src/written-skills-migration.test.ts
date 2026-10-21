import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { writtenSkillsMigration } from './written-skills-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-skills-migration-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(writtenSkillsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it moves the schema to version 19', () => {
  expect(nixieSchema.migrations.indexOf(writtenSkillsMigration) + 1).toBe(19);
});

test('it keeps each snapshot skill with no approval when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into personas (persona_version, instructions) values ('persona-a', '# Persona')`.execute(
    ctx.db,
  );

  await sql`insert into definition_snapshots (snapshot_hash, persona_version, policy_hash, form,
    label, created_at) values ('snapshot-a', 'persona-a', 'policy-a', '{}', 'r1', 1)`.execute(
    ctx.db,
  );

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files)
    values ('skill-a', 'tide-tables', '{}', '{"SKILL.md":"# Tides"}')`.execute(ctx.db);

  await sql`insert into snapshot_skills (snapshot_hash, name, skill_hash, origin, in_conversation)
    values ('snapshot-a', 'tide-tables', 'skill-a', 'definitions', 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => writtenSkillsMigration.up(tx));
  await ctx.db.transaction().execute((tx) => writtenSkillsMigration.up(tx));

  const rows = await sql`select name, skill_hash, approval_id from snapshot_skills`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { name: 'tide-tables', skill_hash: 'skill-a', approval_id: null },
  ]);
});

test('it refuses a second version in force of one skill that nixie wrote', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => writtenSkillsMigration.up(tx));

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files) values
    ('skill-a', 'tide-tables', '{}', '{}'), ('skill-b', 'tide-tables', '{}', '{}')`.execute(ctx.db);

  await sql`insert into written_skills (approval_id, proposal_id, name, skill_hash, state,
    approved_at, updated_at) values
    ('5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', 'k3vq8m2xpa', 'tide-tables', 'skill-a', 'in_force', 1, 1)`.execute(
    ctx.db,
  );

  const insert = sql`insert into written_skills (approval_id, proposal_id, name, skill_hash, state,
    approved_at, updated_at) values
    ('9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74', 'w7tn4c9rhz', 'tide-tables', 'skill-b', 'in_force', 2, 2)`.execute(
    ctx.db,
  );

  await Promise.allSettled([insert]);

  expect(insert).rejects.toThrowWithMessage(Error, /UNIQUE constraint failed/u);
});
