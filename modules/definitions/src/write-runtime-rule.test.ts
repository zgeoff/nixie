import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { createPathSource } from './create-path-source';
import { readRuleProposals } from './read-rule-proposals';
import { readRulesInForce } from './read-rules-in-force';
import { runInForceSeed } from './run-in-force-seed';
import { runSeed } from './run-seed';
import { writeRuntimeRule } from './write-runtime-rule';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-runtime-rule-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const clock = { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() };

  const writer = await startWriter({ dataDir: directory, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };

  return {
    root,
    log,
    seed: () =>
      runSeed({
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
    context: {
      log,
      clock,
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      seedInForce: () => runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) }),
    },
  };
}

test('it puts a runtime change in force as a new revision of its rule', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const change = await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'deny', tools: ['mail.send'] },
    changedBy: 'nixie',
    reason: 'You asked to stop all mail this week.',
  });

  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(rules).toStrictEqual([
    {
      ruleID: 'ask-mail',
      revision: 2,
      rule: {
        hash: expect.any(String),
        rule: { id: 'ask-mail', outcome: 'deny', tools: ['mail.send'] },
      },
      origin: 'nixie',
      changeID: change.changeID,
      lastFiredAt: null,
    },
  ]);
});

test('it records a runtime change with its sentence, who made it and why', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  const change = await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  const records = await readRecords(ctx.log, { afterSequence: 1 });

  expect(records[0]?.record).toMatchObject({
    kind: 'rules.runtime_changed',
    payload: {
      changeID: change.changeID,
      ruleID: 'deny-shell',
      ruleHash: expect.any(String),
      sentence: expect.any(String),
      changedBy: 'owner',
      reason: 'No shell commands.',
    },
  });
});

test('it takes a rule out of force when a runtime change removes it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: null,
    changedBy: 'owner',
    reason: 'Mail no longer needs a check.',
  });

  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(rules).toStrictEqual([]);
});

test('it puts the latest of two runtime changes to one rule in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  const second = await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'ask', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'Ask before a shell command.',
  });

  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(
    rules.map((entry) => [entry.revision, entry.changeID, entry.rule.rule.outcome]),
  ).toStrictEqual([[2, second.changeID, 'ask']]);
});

test('it gives a rule a new revision when a runtime change brings back an earlier version', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'deny', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'No mail this week.',
  });

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'ask', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'Mail can go out again.',
  });

  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(rules.map((entry) => [entry.revision, entry.origin, entry.changeID])).toStrictEqual([
    [3, 'definitions', null],
  ]);
});

test('it proposes again without a widening that a runtime change put in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\nallow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'ask', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'Ask before mail, as the repo says.',
  });

  const proposals = await readRuleProposals(ctx.log.writer.db);

  expect(
    proposals.map((entry) => [
      entry.outcome,
      entry.proposal.changes.map((change) => change.ruleID),
    ]),
  ).toStrictEqual([
    ['withdrawn', ['allow-web', 'ask-mail']],
    [null, ['allow-web']],
  ]);
});
