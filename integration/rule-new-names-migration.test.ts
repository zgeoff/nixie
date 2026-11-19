import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startTestAPI } from '@heynixie/api/test-utils';
import { nixieSchema } from '@heynixie/db';
import {
  createPathSource,
  readDefinitionsInForce,
  readRuleProposals,
  readRulesInForce,
  readSnapshotPolicy,
  runSeed,
} from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { runProjectionRebuild, withWriteTransaction } from '@heynixie/log';
import type { PolicyCall, RuleForm } from '@heynixie/policy';
import { makeDecisionPoint } from '@heynixie/policy';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildOldRuleRow, toCanonical } from './test-utils/build-old-rule-row';

async function setupTest() {
  const api = await startTestAPI();

  const db = api.writer.db;
  const root = join(api.dataDir, 'definitions');

  // The file spells some rules with the new names and some with the old ones.
  const rulesFile = `deny-triage-sends:
  outcome: deny
  tools: [mail.send]
  contexts: [task]
  definitions: [inbox-triage]
deny-chat-tasks:
  outcome: deny
  tools: [mail.bulk]
  contexts: [job, task]
ask-in-chat:
  outcome: ask
  tools: [mail.send]
  contexts: [conversation]
deny-old-names:
  outcome: deny
  tools: [mail.archive]
  contexts: [job]
  jobs: [nightly-sweep]
`;

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');
  await writeFile(join(root, 'rules', 'mail.yaml'), rulesFile);

  const migration = nixieSchema.migrations.find(
    (candidate) => candidate.name === 'store rules in the new names definitions and task',
  );

  invariant(migration);

  const ruleHashTables = [
    ['rules', 'rule_hash'],
    ['rule_revisions', 'rule_hash'],
    ['definition_rules', 'rule_hash'],
    ['seeded_rules', 'rule_hash'],
    ['snapshot_rules', 'rule_hash'],
  ] as const;

  const recordSchema = z.record(z.string(), z.unknown());

  const downgrade = () =>
    withWriteTransaction(api.writer, async (tx) => {
      await sql`pragma defer_foreign_keys = on`.execute(tx);

      const versionResult = await sql`select rule_hash, rule from rule_versions`.execute(tx);

      const versions = z
        .object({ rule_hash: z.string(), rule: z.string() })
        .array()
        .parse(versionResult.rows);

      for (const version of versions) {
        const old = buildOldRuleRow(recordSchema.parse(JSON.parse(version.rule)));

        if (old === null) {
          continue;
        }

        const oldHash = old.hash;

        await sql`update rule_versions set rule_hash = ${oldHash}, rule = ${JSON.stringify(old.form)}
          where rule_hash = ${version.rule_hash}`.execute(tx);

        for (const [table, column] of ruleHashTables) {
          await sql`update ${sql.table(table)} set ${sql.id(column)} = ${oldHash}
            where ${sql.id(column)} = ${version.rule_hash}`.execute(tx);
        }
      }

      const snapshotResult =
        await sql`select snapshot_hash, form from definition_snapshots`.execute(tx);

      const snapshots = z
        .object({ snapshot_hash: z.string(), form: z.string() })
        .array()
        .parse(snapshotResult.rows);

      for (const snapshot of snapshots) {
        const form = z
          .object({ policy: z.looseObject({ rules: z.array(recordSchema) }) })
          .loose()
          .parse(JSON.parse(snapshot.form));

        const rules = form.policy.rules.map((entry) => {
          const rule = recordSchema.parse(entry['rule']);

          return { ...entry, rule: buildOldRuleRow(rule)?.form ?? rule };
        });

        const text = toCanonical({ ...form, policy: { ...form.policy, rules } });

        await sql`update definition_snapshots set form = ${text}
          where snapshot_hash = ${snapshot.snapshot_hash}`.execute(tx);
      }
    });

  const decide = makeDecisionPoint({
    findDeclaration: () => ({
      effects: ['send'],
      destinations: [],
      amount: null,
      content: [],
      results: { delivered: 'untrusted' },
    }),
    readInputs: async (snapshot) => {
      const read = await readSnapshotPolicy(db, snapshot);

      return { rules: read.rules, contacts: [], tools: read.tools, ownerDestinations: [] };
    },
    findTaskDestinations: () => [],
    readConsent: () => Promise.resolve(null),
  });

  return {
    runSeedAgain: () =>
      runSeed({
        tasks: buildTestTaskSeed(),
        log: api.context.log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
    migrate: () => withWriteTransaction(api.writer, (tx) => migration.up(tx)),
    downgrade,
    rebuild: () => runProjectionRebuild(api.context.log),
    readStored: async () => {
      const versions = await sql`select rule_hash, rule from rule_versions
        order by rule_hash`.execute(db);

      const references = [];

      for (const [table, column] of ruleHashTables) {
        const rows = await sql`select * from ${sql.table(table)}
          order by ${sql.id(column)}, 1, 2`.execute(db);

        references.push([table, rows.rows]);
      }

      const snapshots = await sql`select snapshot_hash, form from definition_snapshots
        order by snapshot_hash`.execute(db);

      return { versions: versions.rows, references, snapshots: snapshots.rows };
    },
    readOldNames: async () => {
      const rows = await sql`select rule from rule_versions where rule like '%"jobs"%'`.execute(db);

      return rows.rows.length;
    },
    decideAll: async () => {
      const inForce = await readDefinitionsInForce(db);

      invariant(inForce, 'the seed put definitions in force');

      const call = (overrides: Partial<PolicyCall>): PolicyCall => ({
        tool: 'mail.send',
        toolList: ['mail.send', 'mail.bulk', 'mail.archive'],
        context: 'conversation',
        definitionID: null,
        args: {},
        destinations: [],
        sources: ['owner'],
        at: api.clock.now(),
        turnMessageSequence: null,
        onBehalfOf: [],
        snapshot: inForce.snapshotHash,
        ...overrides,
      });

      const calls = [
        call({ context: 'task', definitionID: 'inbox-triage' }),
        call({ context: 'task', definitionID: 'other-definition' }),
        call({ tool: 'mail.bulk', context: 'task' }),
        call({ tool: 'mail.archive', context: 'task', definitionID: 'nightly-sweep' }),
        call({ tool: 'mail.archive', context: 'task', definitionID: 'other-definition' }),
        call({}),
      ];

      const decisions = await Promise.all(calls.map((entry) => decide(entry)));

      return decisions.map((entry) => entry.decision.rule?.id ?? null);
    },
    readInForce: async () => {
      const rules = await readRulesInForce(db);

      return rules.map((entry) => [entry.ruleID, entry.rule.rule]);
    },
    writeRulesFile: (text: string) => writeFile(join(root, 'rules', 'mail.yaml'), text),
    writeClosedProposal: async (hash: string) => {
      await sql`insert into closed_rule_proposals (proposal_hash) values (${hash})`.execute(db);
    },
    readProposals: async () => {
      const proposals = await readRuleProposals(db);

      return proposals.map((state) => ({
        outcome: state.outcome,
        changes: state.proposal.changes.map((change) => change.ruleID),
      }));
    },
  };
}

test('it leaves the rows the new code writes for the same rules, and the rules match the same calls', async () => {
  const ctx = await setupTest();

  await ctx.runSeedAgain();

  const written = await ctx.readStored();
  const decidedBefore = await ctx.decideAll();

  await ctx.downgrade();

  const oldRows = await ctx.readOldNames();

  await ctx.migrate();

  const migrated = await ctx.readStored();
  const decidedAfter = await ctx.decideAll();

  expect(oldRows).toBe(2);
  expect(migrated).toStrictEqual(written);

  expect(decidedBefore).toStrictEqual([
    'deny-triage-sends',
    null,
    'deny-chat-tasks',
    'deny-old-names',
    null,
    'ask-in-chat',
  ]);

  expect(decidedAfter).toStrictEqual(decidedBefore);
});

test('it records no new revision and no conflict when the same rules file seeds again', async () => {
  const ctx = await setupTest();

  await ctx.runSeedAgain();
  await ctx.downgrade();
  await ctx.migrate();

  const before = await ctx.readStored();
  const result = await ctx.runSeedAgain();
  const after = await ctx.readStored();

  expect(result.status).toBe('unchanged');
  expect(after).toStrictEqual(before);
});

test('it gives the same rows after a projection rebuild as the migration left', async () => {
  const ctx = await setupTest();

  await ctx.runSeedAgain();
  await ctx.downgrade();
  await ctx.migrate();

  const migrated = await ctx.readStored();
  const inForce = await ctx.readInForce();

  await ctx.rebuild();

  const rebuilt = await ctx.readStored();
  const rebuiltInForce = await ctx.readInForce();

  expect(rebuilt).toStrictEqual(migrated);
  expect(rebuiltInForce).toStrictEqual(inForce);
});

test('it puts a widening in force after the migration, even one rejected before a log reset', async () => {
  const ctx = await setupTest();

  await ctx.runSeedAgain();
  await ctx.downgrade();

  const stored: RuleForm = {
    id: 'deny-old-names',
    outcome: 'deny',
    tools: ['mail.archive'],
    contexts: ['task'],
    definitions: ['nightly-sweep'],
  };

  const before = buildOldRuleRow(stored);
  const after = buildOldRuleRow({ ...stored, outcome: 'ask' });

  invariant(before && after);

  const hasher = new Bun.CryptoHasher('sha256');

  hasher.update(toCanonical([{ ruleID: stored.id, before: before.hash, after: after.hash }]));

  await ctx.writeClosedProposal(hasher.digest('hex'));
  await ctx.migrate();

  await ctx.writeRulesFile(`deny-triage-sends:
  outcome: deny
  tools: [mail.send]
  contexts: [task]
  definitions: [inbox-triage]
deny-chat-tasks:
  outcome: deny
  tools: [mail.bulk]
  contexts: [job, task]
ask-in-chat:
  outcome: ask
  tools: [mail.send]
  contexts: [conversation]
deny-old-names:
  outcome: ask
  tools: [mail.archive]
  contexts: [task]
  definitions: [nightly-sweep]
`);

  await ctx.runSeedAgain();

  const inForce = await ctx.readInForce();
  const proposals = await ctx.readProposals();

  expect({
    widened: inForce.filter(([ruleID]) => ruleID === 'deny-old-names'),
    proposals,
  }).toStrictEqual({
    widened: [
      [
        'deny-old-names',
        {
          id: 'deny-old-names',
          outcome: 'ask',
          tools: ['mail.archive'],
          contexts: ['task'],
          definitions: ['nightly-sweep'],
        },
      ],
    ],
    proposals: [],
  });
});
