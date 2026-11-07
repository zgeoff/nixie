import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { rulesMigration } from './rules-migration';
import { runMigrations } from './run-migrations';
import { readRunPrefix } from './test-utils/read-run-prefix';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-rules-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(0, nixieSchema.migrations.indexOf(rulesMigration)),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 39, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(rulesMigration) + 1).toBe(39);
  expect(nixieSchema.oldestReader).toBe(35);
});

test('it keeps one runtime change in force per rule', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into rule_versions (rule_hash, rule) values ('hash-a', '{}')`.execute(ctx.db);

  await sql`insert into runtime_rules (change_id, rule_id, rule_hash, state, changed_by, reason,
    changed_at, updated_at) values ('change-a', 'allow-team-mail', 'hash-a', 'in_force', 'owner',
    'Team mail never needs a card.', 1, 1)`.execute(ctx.db);

  const second = sql`insert into runtime_rules (change_id, rule_id, rule_hash, state, changed_by,
    reason, changed_at, updated_at) values ('change-b', 'allow-team-mail', 'hash-a', 'in_force',
    'owner', 'Again.', 2, 2)`.execute(ctx.db);

  await second.catch(() => {});

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
});
