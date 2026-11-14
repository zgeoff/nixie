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
import { ruleNewNamesMigration } from './0048-rule-new-names-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-rule-new-names-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeVersion: async (hash: string, rule: string) => {
      await sql`insert into rule_versions (rule_hash, rule) values (${hash}, ${rule})`.execute(db);
    },
    writeRecord: async (
      kind: string,
      payload: unknown,
      options: { readonly decision?: unknown; readonly actionHash?: string } = {},
    ) => {
      await sql`insert into records (recorded_at, kind, decision, action_hash, snapshot_hash, payload)
        values (1, ${kind},
          ${options.decision === undefined ? null : JSON.stringify(options.decision)},
          ${options.actionHash ?? null}, 'snapshot', ${JSON.stringify(payload)})`.execute(db);
    },
    writeSnapshot: async (hash: string, form: string) => {
      await sql`insert or ignore into personas (persona_version, instructions)
        values ('p1', 'persona')`.execute(db);

      await sql`insert into definition_snapshots
        (snapshot_hash, persona_version, policy_hash, form, label, created_at)
        values (${hash}, 'p1', ${`policy-${hash}`}, ${form}, 'label', 1)`.execute(db);
    },
    hashText: (text: string) => {
      const hasher = new Bun.CryptoHasher('sha256');

      hasher.update(text);

      return hasher.digest('hex');
    },
    entry: (ruleID: string, before: string | null, after: string | null) =>
      `{"after":${JSON.stringify(after)},"before":${JSON.stringify(before)},"ruleID":"${ruleID}"}`,
    runMigration: () => db.transaction().execute((tx) => ruleNewNamesMigration.up(tx)),
    readVersions: () =>
      readQueryRows(
        sql`select rule_hash, rule from rule_versions order by rule_hash`,
        db,
        z.object({ rule_hash: z.string(), rule: z.string() }),
      ),
  };
}

test('it moves the schema to version 48, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(ruleNewNamesMigration) + 1).toBe(48);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(48);
});

test.each([
  {
    title: 'jobs with the context job',
    old: { id: 'ask-runs', outcome: 'ask', contexts: ['job'], jobs: ['digest'] },
    next: { id: 'ask-runs', outcome: 'ask', contexts: ['task'], definitions: ['digest'] },
  },
  {
    title: 'the contexts job and task',
    old: { id: 'ask-tasks', outcome: 'ask', contexts: ['job', 'task'] },
    next: { id: 'ask-tasks', outcome: 'ask', contexts: ['task'] },
  },
  {
    title: 'the context job beside another context',
    old: { id: 'allow-code', outcome: 'allow', contexts: ['job', 'coding'], note: 'n' },
    next: { id: 'allow-code', outcome: 'allow', contexts: ['coding', 'task'], note: 'n' },
  },
  {
    title: 'jobs alone, with the keys out of order',
    old: { jobs: ['a', 'b'], outcome: 'deny', id: 'deny-runs', tools: ['mail.send'] },
    next: { id: 'deny-runs', outcome: 'deny', tools: ['mail.send'], definitions: ['a', 'b'] },
  },
])('it rewrites a rule with $title to the new names', async (row) => {
  const ctx = await setupTest();

  await ctx.writeVersion('a'.repeat(64), JSON.stringify(row.old));
  await ctx.runMigration();

  const versions = await ctx.readVersions();

  expect(versions).toStrictEqual([
    { rule_hash: expect.stringMatching(/^[0-9a-f]{64}$/u), rule: JSON.stringify(row.next) },
  ]);

  expect(versions[0]?.rule_hash).not.toBe('a'.repeat(64));
});

test('it gives the new form the hash of its canonical JSON', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(
    'a'.repeat(64),
    JSON.stringify({ id: 'r', outcome: 'ask', contexts: ['job'] }),
  );

  await ctx.runMigration();

  const hasher = new Bun.CryptoHasher('sha256');

  hasher.update('{"contexts":["task"],"id":"r","outcome":"ask"}');

  const versions = await ctx.readVersions();

  expect(versions.map((row) => row.rule_hash)).toStrictEqual([hasher.digest('hex')]);
});

test('it leaves a rule with no old names unchanged, with its hash', async () => {
  const ctx = await setupTest();

  const text = JSON.stringify({ id: 'r', outcome: 'ask', contexts: ['task'], definitions: ['x'] });

  await ctx.writeVersion('b'.repeat(64), text);
  await ctx.runMigration();

  const versions = await ctx.readVersions();

  expect(versions).toStrictEqual([{ rule_hash: 'b'.repeat(64), rule: text }]);
});

test('it merges two old rules that give one new form, and an existing new row', async () => {
  const ctx = await setupTest();

  await ctx.writeVersion(
    'a'.repeat(64),
    JSON.stringify({ id: 'r', outcome: 'ask', contexts: ['job'] }),
  );

  await ctx.writeVersion(
    'b'.repeat(64),
    JSON.stringify({ id: 'r', outcome: 'ask', contexts: ['job', 'task'] }),
  );

  const existing = new Bun.CryptoHasher('sha256');

  existing.update('{"contexts":["task"],"id":"r","outcome":"ask"}');

  await ctx.writeVersion(
    existing.digest('hex'),
    JSON.stringify({ id: 'r', outcome: 'ask', contexts: ['task'] }),
  );

  await sql`insert into rules (rule_id, revision, rule_hash, origin, created_at, updated_at)
    values ('r', 1, ${'a'.repeat(64)}, 'nixie', 1, 1)`.execute(ctx.db);

  await sql`insert into rule_revisions (rule_id, revision, rule_hash, created_at)
    values ('r', 1, ${'a'.repeat(64)}, 1), ('r', 2, ${'b'.repeat(64)}, 2)`.execute(ctx.db);

  await ctx.runMigration();

  const versions = await ctx.readVersions();

  const revisions = await sql`select rule_hash from rule_revisions order by revision`.execute(
    ctx.db,
  );

  expect(versions).toHaveLength(1);

  expect(revisions.rows).toStrictEqual([
    { rule_hash: versions[0]?.rule_hash },
    { rule_hash: versions[0]?.rule_hash },
  ]);
});

test('it repoints every column that holds a rule hash', async () => {
  const ctx = await setupTest();

  const old = 'a'.repeat(64);

  await ctx.writeVersion(old, JSON.stringify({ id: 'r', outcome: 'ask', jobs: ['x'] }));
  await ctx.writeSnapshot('snap', '{}');

  await sql`insert into rules (rule_id, revision, rule_hash, origin, created_at, updated_at)
    values ('r', 1, ${old}, 'nixie', 1, 1)`.execute(ctx.db);

  await sql`insert into rule_revisions (rule_id, revision, rule_hash, created_at)
    values ('r', 1, ${old}, 1)`.execute(ctx.db);

  await sql`insert into definition_rules (rule_id, rule_hash, path)
    values ('r', ${old}, 'rules.yaml')`.execute(ctx.db);

  await sql`insert into seeded_rules (rule_id, rule_hash) values ('r', ${old})`.execute(ctx.db);

  await sql`insert into runtime_rules (change_id, rule_id, rule_hash, state, base_hash,
      definitions_hash, changed_by, reason, changed_at, updated_at)
    values ('c1', 'r', ${old}, 'in_force', ${old}, ${old}, 'owner', 'why', 1, 1)`.execute(ctx.db);

  await sql`insert into snapshot_rules (snapshot_hash, rule_id, revision, rule_hash)
    values ('snap', 'r', 1, ${old})`.execute(ctx.db);

  await sql`insert into proposals (proposal_id, short_id, family, kind, risk_class, action_hash,
      rule_hash, cause, created_sequence, created_at, lapses_at, state)
    values ('p1', 's1', 'action', 'action', 'routine', 'act', ${old}, 'ask_rule', 1, 1, 9,
      'pending')`.execute(ctx.db);

  await ctx.runMigration();

  const [version] = await ctx.readVersions();

  const hash = version?.rule_hash;

  const held = await sql`select
    (select rule_hash from rules) as rules,
    (select rule_hash from rule_revisions) as revisions,
    (select rule_hash from definition_rules) as definitions,
    (select rule_hash from seeded_rules) as seeded,
    (select rule_hash from runtime_rules) as runtime,
    (select base_hash from runtime_rules) as base,
    (select definitions_hash from runtime_rules) as definitionsHash,
    (select rule_hash from snapshot_rules) as snapshot,
    (select rule_hash from proposals) as proposals`.execute(ctx.db);

  expect(held.rows).toStrictEqual([
    {
      rules: hash,
      revisions: hash,
      definitions: hash,
      seeded: hash,
      runtime: hash,
      base: hash,
      definitionsHash: hash,
      snapshot: hash,
      proposals: hash,
    },
  ]);
});

test('it rewrites the rule hash of each record payload and the hash of a rule proposal', async () => {
  const ctx = await setupTest();

  const old = 'a'.repeat(64);
  const other = 'd'.repeat(64);

  await ctx.writeVersion(old, JSON.stringify({ id: 'r', outcome: 'ask', jobs: ['x'] }));

  const oldHasher = new Bun.CryptoHasher('sha256');

  oldHasher.update(JSON.stringify([{ after: old, before: other, ruleID: 'r' }]));

  const oldProposal = oldHasher.digest('hex');

  await ctx.writeRecord(
    'rules.change_proposed',
    {
      proposalID: 'p',
      proposalHash: oldProposal,
      changes: [
        {
          ruleID: 'r',
          before: { hash: other, sentence: 's' },
          after: { hash: old, sentence: 't' },
        },
      ],
      fields: [],
    },
    { actionHash: oldProposal },
  );

  await ctx.writeRecord('rules.runtime_changed', {
    changeID: 'c',
    ruleID: 'r',
    ruleHash: old,
    sentence: null,
    changedBy: 'owner',
    reason: 'why',
  });

  await sql`insert into closed_rule_proposals (proposal_hash) values (${oldProposal})`.execute(
    ctx.db,
  );

  await ctx.runMigration();

  const [version] = await ctx.readVersions();

  const newHasher = new Bun.CryptoHasher('sha256');

  newHasher.update(JSON.stringify([{ after: version?.rule_hash, before: other, ruleID: 'r' }]));

  const newProposal = newHasher.digest('hex');

  const rows = await sql`select kind, payload, action_hash from records order by sequence`.execute(
    ctx.db,
  );

  const closed = await sql`select proposal_hash from closed_rule_proposals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      kind: 'rules.change_proposed',
      payload: JSON.stringify({
        proposalID: 'p',
        proposalHash: newProposal,
        changes: [
          {
            ruleID: 'r',
            before: { hash: other, sentence: 's' },
            after: { hash: version?.rule_hash, sentence: 't' },
          },
        ],
        fields: [],
      }),
      action_hash: newProposal,
    },
    {
      kind: 'rules.runtime_changed',
      payload: JSON.stringify({
        changeID: 'c',
        ruleID: 'r',
        ruleHash: version?.rule_hash,
        sentence: null,
        changedBy: 'owner',
        reason: 'why',
      }),
      action_hash: null,
    },
  ]);

  expect(closed.rows).toStrictEqual([{ proposal_hash: newProposal }]);
});

test('it leaves a hash quoted in the free text of a record unchanged', async () => {
  const ctx = await setupTest();

  const old = 'a'.repeat(64);

  await ctx.writeVersion(old, JSON.stringify({ id: 'r', outcome: 'ask', jobs: ['x'] }));

  const payload = {
    changeID: 'c',
    ruleID: 'r',
    ruleHash: old,
    sentence: null,
    changedBy: 'owner',
    reason: `kept ${old} after review`,
  };

  await ctx.writeRecord('rules.runtime_changed', payload);
  await ctx.runMigration();

  const [version] = await ctx.readVersions();
  const rows = await sql`select payload from records`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { payload: JSON.stringify({ ...payload, ruleHash: version?.rule_hash }) },
  ]);
});

test('it rewrites a decision whose recorded context is job and keeps the permission job', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord(
    'tool_called',
    {},
    {
      decision: {
        outcome: 'allow',
        stage: 3,
        rule: null,
        permissions: ['job'],
        inputs: { toolList: ['t'], context: 'job', definitionID: 'd', sources: [] },
      },
    },
  );

  await ctx.writeRecord(
    'tool_called',
    {},
    { decision: { outcome: 'allow', stage: 3, rule: null, inputs: { context: 'coding' } } },
  );

  await ctx.runMigration();

  const rows = await sql`select decision from records order by sequence`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      decision: JSON.stringify({
        outcome: 'allow',
        stage: 3,
        rule: null,
        permissions: ['job'],
        inputs: { toolList: ['t'], context: 'task', definitionID: 'd', sources: [] },
      }),
    },
    {
      decision: JSON.stringify({
        outcome: 'allow',
        stage: 3,
        rule: null,
        inputs: { context: 'coding' },
      }),
    },
  ]);
});

test('it rewrites each rule of a snapshot form and keeps its hashes', async () => {
  const ctx = await setupTest();

  await ctx.writeSnapshot(
    'hash-a',
    JSON.stringify({
      policy: {
        rules: [
          {
            id: 'r',
            revision: 1,
            sentence: 's',
            rule: { id: 'r', jobs: ['x'], contexts: ['job'], outcome: 'ask' },
          },
          { id: 'q', revision: 2, sentence: 't', rule: { id: 'q', outcome: 'allow' } },
        ],
        tools: [],
      },
    }),
  );

  await ctx.runMigration();

  const rows = await sql`select snapshot_hash, policy_hash, form from definition_snapshots`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    {
      snapshot_hash: 'hash-a',
      policy_hash: 'policy-hash-a',
      form: '{"policy":{"rules":[{"id":"r","revision":1,"rule":{"contexts":["task"],"definitions":["x"],"id":"r","outcome":"ask"},"sentence":"s"},{"id":"q","revision":2,"rule":{"id":"q","outcome":"allow"},"sentence":"t"}],"tools":[]}}',
    },
  ]);
});

test('it leaves the text of a record unchanged when no hash field moves', async () => {
  const ctx = await setupTest();

  const old = 'a'.repeat(64);

  await ctx.writeVersion(old, JSON.stringify({ id: 'r', outcome: 'ask', jobs: ['x'] }));

  const text = `{ "ruleHash": null, "reason": "kept ${old} after review" }`;

  await sql`insert into records (recorded_at, kind, snapshot_hash, payload)
    values (1, 'rules.runtime_changed', 'snapshot', ${text})`.execute(ctx.db);

  await ctx.runMigration();

  const rows = await sql`select payload from records`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ payload: text }]);
});

test('it keeps the hash of a closed proposal whose records a log reset deleted', async () => {
  const ctx = await setupTest();

  const old = 'a'.repeat(64);

  await ctx.writeVersion(old, JSON.stringify({ id: 'r', outcome: 'ask', jobs: ['x'] }));

  const closedHash = ctx.hashText(`[${ctx.entry('r', null, old)}]`);

  await sql`insert into closed_rule_proposals (proposal_hash) values (${closedHash})`.execute(
    ctx.db,
  );

  await ctx.runMigration();

  const closed = await sql`select proposal_hash from closed_rule_proposals`.execute(ctx.db);

  expect(closed.rows).toStrictEqual([{ proposal_hash: closedHash }]);
});

test('it keeps the hash of a closed proposal over rules with no old names', async () => {
  const ctx = await setupTest();

  const moved = 'a'.repeat(64);
  const unmoved = 'b'.repeat(64);

  await ctx.writeVersion(moved, JSON.stringify({ id: 'r1', outcome: 'ask', jobs: ['x'] }));
  await ctx.writeVersion(unmoved, JSON.stringify({ id: 'r2', outcome: 'deny' }));

  const payload = {
    proposalID: 'p',
    proposalHash: ctx.hashText(`[${ctx.entry('r2', null, unmoved)}]`),
    changes: [{ ruleID: 'r2', before: null, after: { hash: unmoved, sentence: 'Deny.' } }],
    effectChanges: [],
  };

  await ctx.writeRecord('rules.change_proposed', payload);

  await sql`insert into closed_rule_proposals (proposal_hash)
    values (${payload.proposalHash})`.execute(ctx.db);

  await ctx.runMigration();

  const closed = await sql`select proposal_hash from closed_rule_proposals`.execute(ctx.db);

  expect(closed.rows).toStrictEqual([{ proposal_hash: payload.proposalHash }]);
});
