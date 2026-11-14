import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { readQueryRows } from '../read-query-rows';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { retiredRuleIDMigration } from './0046-retired-rule-id-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-retired-rule-id-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeRecord: async (kind: string, decision: unknown) => {
      await sql`insert into records (recorded_at, kind, decision, snapshot_hash, payload)
        values (1, ${kind}, ${JSON.stringify(decision)}, 'snapshot', '{}')`.execute(db);
    },
    writeSnapshot: async (hash: string, form: string) => {
      await sql`insert or ignore into personas (persona_version, instructions)
        values ('p1', 'persona')`.execute(db);

      await sql`insert into definition_snapshots
        (snapshot_hash, persona_version, policy_hash, form, label, created_at)
        values (${hash}, 'p1', ${`policy-${hash}`}, ${form}, 'label', 1)`.execute(db);
    },
    runMigration: () => db.transaction().execute((tx) => retiredRuleIDMigration.up(tx)),
    readDecisions: () =>
      readQueryRows(
        sql`select decision from records order by sequence`,
        db,
        z.object({ decision: z.string().transform((text) => z.unknown().parse(JSON.parse(text))) }),
      ),
  };
}

test('it is the migration of version 46', () => {
  expect(nixieSchema.migrations.indexOf(retiredRuleIDMigration) + 1).toBe(46);
});

test('it rewrites each decision that names the ID to a null rule and keeps its outcome and stage', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord('tool_called', {
    outcome: 'allow',
    stage: 3,
    rule: { id: 'slice1.read-only', revision: 1 },
  });

  await ctx.writeRecord('tool_called', {
    outcome: 'deny',
    stage: 3,
    rule: { id: 'slice1.read-only', revision: 1 },
  });

  await ctx.writeRecord('action.queued', {
    outcome: 'allow',
    stage: 3,
    rule: { id: 'slice1.read-only', revision: 1 },
  });

  await ctx.writeRecord('tool_called', {
    outcome: 'allow',
    stage: 3,
    rule: { id: 'slice1.queue-check', revision: 2 },
  });

  await ctx.runMigration();

  const decisions = await ctx.readDecisions();

  expect(decisions.map((row) => row.decision)).toStrictEqual([
    { outcome: 'allow', stage: 3, rule: null },
    { outcome: 'deny', stage: 3, rule: null },
    { outcome: 'allow', stage: 3, rule: null },
    { outcome: 'allow', stage: 3, rule: { id: 'slice1.queue-check', revision: 2 } },
  ]);
});

test('it removes the ID from the other rules of a decision and keeps the rest', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord('tool_called', {
    outcome: 'deny',
    stage: 3,
    rule: { id: 'allow-sends', revision: 1 },
    ruleOthers: ['slice1.read-only', 'ask-more'],
  });

  await ctx.runMigration();

  const decisions = await ctx.readDecisions();

  expect(decisions.map((row) => row.decision)).toStrictEqual([
    {
      outcome: 'deny',
      stage: 3,
      rule: { id: 'allow-sends', revision: 1 },
      ruleOthers: ['ask-more'],
    },
  ]);
});

test('it deletes the rule-fire row and the projection changes of the ID and keeps another rule', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord('tool_called', { outcome: 'allow', stage: 3, rule: null });

  await sql`insert into rule_fires (rule_id, last_fired_at)
    values ('slice1.read-only', 5), ('allow-sends', 6)`.execute(ctx.db);

  await sql`insert into projection_changes (sequence, projection, row_key, row)
    values (1, 'rule_fires', 'slice1.read-only', '{}'), (1, 'rule_fires', 'allow-sends', '{}'),
      (1, 'threads', 'slice1.read-only', '{}')`.execute(ctx.db);

  await ctx.runMigration();

  const fires = await sql`select rule_id from rule_fires`.execute(ctx.db);

  const changes = await sql`select projection, row_key from projection_changes
    order by projection`.execute(ctx.db);

  expect(fires.rows).toStrictEqual([{ rule_id: 'allow-sends' }]);

  expect(changes.rows).toStrictEqual([
    { projection: 'rule_fires', row_key: 'allow-sends' },
    { projection: 'threads', row_key: 'slice1.read-only' },
  ]);
});

test('it drops the ID from each stored snapshot form and keeps the hashes', async () => {
  const ctx = await setupTest();

  const withBoth = JSON.stringify({
    conversation: { skills: [] },
    policy: {
      rules: [
        { id: 'allow-sends', outcome: 'allow' },
        { effects: ['read'], id: 'slice1.read-only', outcome: 'allow' },
      ],
      tools: [],
    },
  });

  const withOnly = JSON.stringify({
    policy: {
      rules: [{ id: 'slice1.read-only', revision: 1, sentence: 'reads are fine' }],
      tools: [],
    },
  });

  await ctx.writeSnapshot('hash-a', withBoth);
  await ctx.writeSnapshot('hash-b', withOnly);
  await ctx.runMigration();

  const rows = await sql`select snapshot_hash, policy_hash, form from definition_snapshots
    order by snapshot_hash`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      snapshot_hash: 'hash-a',
      policy_hash: 'policy-hash-a',
      form: JSON.stringify({
        conversation: { skills: [] },
        policy: { rules: [{ id: 'allow-sends', outcome: 'allow' }], tools: [] },
      }),
    },
    {
      snapshot_hash: 'hash-b',
      policy_hash: 'policy-hash-b',
      form: JSON.stringify({ policy: { rules: [], tools: [] } }),
    },
  ]);
});

test('it leaves no text column of the four tables naming the ID', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord('tool_called', {
    outcome: 'allow',
    stage: 3,
    rule: { id: 'slice1.read-only', revision: 1 },
  });

  await ctx.writeSnapshot(
    'hash-a',
    JSON.stringify({ policy: { rules: [{ id: 'slice1.read-only' }], tools: [] } }),
  );

  await sql`insert into rule_fires (rule_id, last_fired_at) values ('slice1.read-only', 5)`.execute(
    ctx.db,
  );

  await sql`insert into projection_changes (sequence, projection, row_key, row)
    values (1, 'rule_fires', 'slice1.read-only', '{}')`.execute(ctx.db);

  await ctx.runMigration();

  const hits = await sql`select
    (select count(*) from records where decision like '%slice1.read-only%'
      or payload like '%slice1.read-only%' or kind like '%slice1.read-only%') as records,
    (select count(*) from rule_fires where rule_id like '%slice1.read-only%') as fires,
    (select count(*) from projection_changes where row_key like '%slice1.read-only%'
      or row like '%slice1.read-only%') as changes,
    (select count(*) from definition_snapshots where form like '%slice1.read-only%') as snapshots`.execute(
    ctx.db,
  );

  expect(hits.rows).toStrictEqual([{ records: 0, fires: 0, changes: 0, snapshots: 0 }]);
});
