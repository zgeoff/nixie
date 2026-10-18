import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { skillsMigration } from './skills-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-skills-migration-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = new Kysely<unknown>({ dialect: buildSqliteWorkerDialect(join(dir, 'nixie.db')) });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(0, nixieSchema.migrations.indexOf(skillsMigration)),
      oldestReader: 0,
    },
    copyDir: dir,
  });

  return { db };
}

test('it moves the schema to version 17', () => {
  expect(nixieSchema.migrations.indexOf(skillsMigration) + 1).toBe(17);
});

test('it keeps a skill version and the snapshot that holds it when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => skillsMigration.up(tx));

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

  await ctx.db.transaction().execute((tx) => skillsMigration.up(tx));

  const rows = await sql`select snapshot_skills.name, origin, files from snapshot_skills
    join skill_versions using (skill_hash)`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { name: 'tide-tables', origin: 'definitions', files: '{"SKILL.md":"# Tides"}' },
  ]);
});

test('it refuses a snapshot skill of an origin other than the definitions or a vendored copy', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => skillsMigration.up(tx));

  await sql`insert into personas (persona_version, instructions) values ('persona-a', '# Persona')`.execute(
    ctx.db,
  );

  await sql`insert into definition_snapshots (snapshot_hash, persona_version, policy_hash, form,
    label, created_at) values ('snapshot-a', 'persona-a', 'policy-a', '{}', 'r1', 1)`.execute(
    ctx.db,
  );

  await sql`insert into skill_versions (skill_hash, name, frontmatter, files)
    values ('skill-a', 'tide-tables', '{}', '{}')`.execute(ctx.db);

  const insert = sql`insert into snapshot_skills (snapshot_hash, name, skill_hash, origin,
    in_conversation) values ('snapshot-a', 'tide-tables', 'skill-a', 'registry', 1)`.execute(
    ctx.db,
  );

  await Promise.allSettled([insert]);

  expect(insert).rejects.toThrowWithMessage(Error, /CHECK constraint failed/u);
});
