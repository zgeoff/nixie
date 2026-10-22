import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { definitionSeedRepositoryMigration } from './definition-seed-repository-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-definition-seed-repository-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(definitionSeedRepositoryMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 24, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(definitionSeedRepositoryMigration) + 1).toBe(24);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(23);
});

test('it keeps each seed of a database it upgrades as it was, with no repository', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'definitions_seeded', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into personas (persona_version, instructions)
    values ('persona-a', '# Persona')`.execute(ctx.db);

  await sql`insert into definition_snapshots (snapshot_hash, persona_version, policy_hash, form,
    label, created_at)
    values ('snapshot-a', 'persona-a', 'policy-a', '{}', 'content-a', 1767225600000)`.execute(
    ctx.db,
  );

  await sql`insert into definition_seeds (seeded_at, source_id, source_kind, revision,
    content_hash, format_version, snapshot_hash, record_sequence)
    values (1767225600000, 'path:/srv/definitions', 'path', 'content-a', 'content-a', 1,
    'snapshot-a', 1)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const seeds = await sql`select seed, source_id, source_kind, source_repository, revision,
    content_hash from definition_seeds`.execute(ctx.db);

  expect(seeds.rows).toStrictEqual([
    {
      seed: 1,
      source_id: 'path:/srv/definitions',
      source_kind: 'path',
      source_repository: null,
      revision: 'content-a',
      content_hash: 'content-a',
    },
  ]);
});
