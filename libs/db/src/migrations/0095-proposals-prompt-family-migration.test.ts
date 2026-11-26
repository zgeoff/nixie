import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { proposalsPromptFamilyMigration } from './0095-proposals-prompt-family-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-proposals-prompt-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  const writeRecord = (sequence: number, kind: string, thread: string, payload: object) =>
    sql`insert into records (sequence, recorded_at, kind, thread, snapshot_hash, payload)
      values (${sequence}, ${sequence * 1000}, ${kind}, ${thread}, 'snapshot-a', ${JSON.stringify(payload)})`.execute(
      db,
    );

  const migrateAgain = () =>
    db.transaction().execute((tx) => proposalsPromptFamilyMigration.up(tx));

  return { db, writeRecord, migrateAgain };
}

test('it moves the schema to version 95, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(proposalsPromptFamilyMigration) + 1).toBe(95);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(95);
});

test('it lets a proposal take the prompt family and a same-thing key', async () => {
  const ctx = await setupTest();

  await sql`insert into proposals (
      proposal_id, short_id, family, kind, risk_class, action_hash, cause, created_sequence,
      created_at, lapses_at, state, same_thing
    ) values ('p1', 's1', 'prompt', 'internal_change', 'always_ask', 'h', 'prompt_override', 1, 1, 2, 'pending', 'compaction')`.execute(
    ctx.db,
  );

  const rows = await sql`select family, same_thing from proposals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ family: 'prompt', same_thing: 'compaction' }]);
});

test('it folds each prompt override that the log holds into one row with its final state', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord(1, 'prompts.override_proposed', 'conversation', {
    proposalID: 'k3x9m2p7qa',
    promptID: 'compaction',
    proposalHash: 'hash-a',
  });

  await ctx.writeRecord(2, 'prompts.override_proposed', 'conversation', {
    proposalID: 'w7tn4c9rhz',
    promptID: 'session',
    proposalHash: 'hash-b',
  });

  await ctx.writeRecord(3, 'prompts.override_approved', 'conversation', {
    proposalID: 'k3x9m2p7qa',
    approvalID: 'approval-a',
  });

  await ctx.migrateAgain();

  const rows =
    await sql`select proposal_id, family, state, thread, action_hash, same_thing, used_by,
    lapses_at - created_at as wait
    from proposals order by created_sequence`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      proposal_id: 'k3x9m2p7qa',
      family: 'prompt',
      state: 'approved',
      thread: 'conversation',
      action_hash: 'hash-a',
      same_thing: 'compaction',
      used_by: 'approval-a',
      wait: 14 * 24 * 60 * 60 * 1000,
    },
    {
      proposal_id: 'w7tn4c9rhz',
      family: 'prompt',
      state: 'pending',
      thread: 'conversation',
      action_hash: 'hash-b',
      same_thing: 'session',
      used_by: null,
      wait: 14 * 24 * 60 * 60 * 1000,
    },
  ]);
});

test('it keeps the three indexes and the same-thing index of the table when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.migrateAgain();

  const indexes = await sql`select name from pragma_index_list('proposals')
    where name like 'proposals_by_%' order by name`.execute(ctx.db);

  expect(indexes.rows).toStrictEqual([
    { name: 'proposals_by_same_thing' },
    { name: 'proposals_by_short_id' },
    { name: 'proposals_by_state_and_lapse' },
    { name: 'proposals_by_state_and_return' },
  ]);
});

test('it takes the state and the lapse out of the memory proposals, which the shared row holds', async () => {
  const ctx = await setupTest();

  const columns = await sql`select name from pragma_table_info('memory_proposals')
    where name in ('status', 'lapse_at')`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([]);
});

test('it names the tables of the suggested rules for what they hold', async () => {
  const ctx = await setupTest();

  const tables = await sql`select name from sqlite_master
    where type = 'table' and name like '%rule_groups' or name like '%rule_answers' or name like 'gap_%'
    order by name`.execute(ctx.db);

  expect(tables.rows).toStrictEqual([
    { name: 'suggested_rule_answers' },
    { name: 'suggested_rule_groups' },
  ]);
});
