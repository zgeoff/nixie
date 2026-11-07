import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createPathSource } from './create-path-source';
import { readRuleConflicts } from './read-rule-conflicts';
import { readRulesInForce } from './read-rules-in-force';
import { runInForceSeed } from './run-in-force-seed';
import { runSeed } from './run-seed';
import { writeRuleResolution } from './write-rule-resolution';
import { writeRuntimeRule } from './write-runtime-rule';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-rule-resolution-'));

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

test('it keeps a runtime change in force when the repo changes its rule, and lists the conflict', async () => {
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
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'owner',
    reason: 'Replies need the same check.',
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  const result = await ctx.seed();
  const rules = await readRulesInForce(ctx.log.writer.db);
  const conflicts = await readRuleConflicts(ctx.log.writer.db);

  invariant(result.status === 'seeded');

  expect(result.record.payload['rules']).toStrictEqual({
    revisions: [],
    applied: [],
    held: [],
    adopted: [],
    conflicts: ['ask-mail'],
    proposalID: null,
  });

  expect(
    rules.map((entry) => [entry.ruleID, entry.origin, entry.changeID, entry.rule.rule.tools]),
  ).toStrictEqual([['ask-mail', 'nixie', change.changeID, ['mail.reply', 'mail.send']]]);

  expect(
    conflicts.map((conflict) => [conflict.changeID, conflict.beneath?.rule.outcome]),
  ).toStrictEqual([[change.changeID, 'deny']]);
});

test("it keeps the runtime change in force and clears the conflict when you keep nixie's version", async () => {
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
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'owner',
    reason: 'Replies need the same check.',
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuleResolution(ctx.context, { ruleID: 'ask-mail', keep: 'nixie' });

  const rules = await readRulesInForce(ctx.log.writer.db);
  const conflicts = await readRuleConflicts(ctx.log.writer.db);

  expect(rules.map((entry) => [entry.ruleID, entry.changeID])).toStrictEqual([
    ['ask-mail', change.changeID],
  ]);

  expect(conflicts).toStrictEqual([]);
});

test("it puts the repo's version in force and retires the runtime change when you keep the repo's version", async () => {
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
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'owner',
    reason: 'Replies need the same check.',
  });

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuleResolution(ctx.context, { ruleID: 'ask-mail', keep: 'repo' });

  const rules = await readRulesInForce(ctx.log.writer.db);
  const conflicts = await readRuleConflicts(ctx.log.writer.db);

  expect(
    rules.map((entry) => [entry.ruleID, entry.origin, entry.changeID, entry.rule.rule.outcome]),
  ).toStrictEqual([['ask-mail', 'definitions', null, 'deny']]);

  expect(conflicts).toStrictEqual([]);
});

test.each(['nixie', 'repo'] as const)(
  'it records the resolution when you keep the %s version',
  async (keep) => {
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
      rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
      changedBy: 'owner',
      reason: 'Replies need the same check.',
    });

    await writeFile(
      join(ctx.root, 'rules', 'mail.yaml'),
      'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
    );

    await ctx.seed();

    await writeRuleResolution(ctx.context, { ruleID: 'ask-mail', keep });

    const records = await readRecords(ctx.log, { afterSequence: 0 });

    expect(
      records.map((read) => read.record.kind).filter((kind) => kind.startsWith('rules.')),
    ).toStrictEqual(['rules.runtime_changed', 'rules.conflict_resolved']);

    expect(
      records.find((read) => read.record.kind === 'rules.conflict_resolved')?.record.payload,
    ).toStrictEqual({
      changeID: change.changeID,
      ruleID: 'ask-mail',
      keep,
    });
  },
);

test('it refuses to resolve a rule with no conflict', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const resolution = await writeRuleResolution(ctx.context, { ruleID: 'ask-mail', keep: 'nixie' });

  expect(resolution).toMatchObject({ status: 'refused', code: 'NOT_FOUND' });
});
