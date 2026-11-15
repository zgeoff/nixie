import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { proposedRulesMigration } from './0057-proposed-rules-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-proposed-rules-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeProposal: async (proposalID: string, family: string) => {
      await sql`insert into proposals (
          proposal_id, short_id, family, kind, risk_class, action_hash, cause,
          created_sequence, created_at, lapses_at, state, answered_by
        ) values (
          ${proposalID}, ${proposalID}, ${family}, 'internal_change', 'always_ask', 'hash', 'cause',
          1, 1000, 2000, 'pending', 'identity-1'
        )`.execute(db);
    },
    runMigration: () => db.transaction().execute((tx) => proposedRulesMigration.up(tx)),
  };
}

test('it is the migration of version 57', () => {
  expect(nixieSchema.migrations.indexOf(proposedRulesMigration) + 1).toBe(57);
});

test('it accepts a proposed rule and a mandate in the proposals table', async () => {
  const ctx = await setupTest();

  await ctx.writeProposal('rule-1', 'proposed_rule');
  await ctx.writeProposal('mandate-1', 'mandate');

  const rows = await sql`select proposal_id, family from proposals order by proposal_id`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    { proposal_id: 'mandate-1', family: 'mandate' },
    { proposal_id: 'rule-1', family: 'proposed_rule' },
  ]);
});

test('it keeps the rows of every earlier family when it rebuilds the table', async () => {
  const ctx = await setupTest();

  await sql`drop table proposals`.execute(ctx.db);

  await sql`create table proposals (
    proposal_id text primary key, short_id text not null,
    family text not null check (family in ('action', 'memory', 'skill', 'rule_change')),
    kind text not null, risk_class text not null, action_hash text not null, rule_hash text,
    cause text not null, task_id text, thread text, created_sequence integer not null,
    created_at integer not null, lapses_at integer not null, deadline_at integer,
    state text not null, used_by text, defer_generation integer not null default 0,
    defer_until integer, return_at integer, answered_by text
  ) strict`.execute(ctx.db);

  for (const family of ['action', 'memory', 'skill', 'rule_change']) {
    await ctx.writeProposal(`${family}-1`, family);
  }

  await ctx.runMigration();

  const rows = await sql`select family, answered_by from proposals order by proposal_id`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    { family: 'action', answered_by: 'identity-1' },
    { family: 'memory', answered_by: 'identity-1' },
    { family: 'rule_change', answered_by: 'identity-1' },
    { family: 'skill', answered_by: 'identity-1' },
  ]);
});

test('it refuses a family the table does not know', async () => {
  const ctx = await setupTest();

  const insert = ctx.writeProposal('other-1', 'other');

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it creates the gap tables', async () => {
  const ctx = await setupTest();

  await sql`insert into gap_groups (group_hash) values ('group-1')`.execute(ctx.db);

  await sql`insert into gap_answers (proposal_id, group_hash, answer, answered_at, answered_sequence)
    values ('p-1', 'group-1', 'approved', 1000, 5)`.execute(ctx.db);

  const rows = await sql`select group_hash, answer from gap_answers`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ group_hash: 'group-1', answer: 'approved' }]);
});
