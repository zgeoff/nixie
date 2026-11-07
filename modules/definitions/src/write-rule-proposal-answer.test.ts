import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { proposalLapseMs } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { createPathSource } from './create-path-source';
import { readRuleProposals } from './read-rule-proposals';
import { readRulesInForce } from './read-rules-in-force';
import { runInForceSeed } from './run-in-force-seed';
import { runSeed } from './run-seed';
import { writeRuleProposalAnswer } from './write-rule-proposal-answer';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-rule-answer-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const time = { now: Date.parse('2026-10-16T09:00:00Z') };
  const clock = { now: () => time.now, sleep: () => Promise.resolve() };

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
    time,
    readProposals: () => readRuleProposals(writer.db),
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
      runInForceSeed: () => runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) }),
    },
  };
}

test('it puts the widening of a rule change proposal in force once you approve it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  await writeRuleProposalAnswer(ctx.context, { answer: 'approve', proposalID });

  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(
    rules.map((entry) => [entry.ruleID, entry.revision, entry.rule.rule.outcome]),
  ).toStrictEqual([['deny-mail', 2, 'ask']]);
});

test('it records your approval of a rule change proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  const held = await ctx.seed();

  invariant(held.status === 'seeded');

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  const result = await writeRuleProposalAnswer(ctx.context, { answer: 'approve', proposalID });
  const records = await readRecords(ctx.log, { afterSequence: held.record.sequence + 1 });

  expect(result).toStrictEqual({ status: 'approved', proposalID });

  expect(records.map((read) => [read.record.kind, read.record.payload])).toStrictEqual([
    ['rules.change_approved', { proposalID }],
    ['definitions_seeded', expect.any(Object)],
  ]);
});

test('it keeps the version in force and records your reason when you reject a rule change proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'deny-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  const held = await ctx.seed();

  invariant(held.status === 'seeded');

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  await writeRuleProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID,
    reason: 'Mail stays blocked for now.',
  });

  const rules = await readRulesInForce(ctx.log.writer.db);
  const records = await readRecords(ctx.log, { afterSequence: held.record.sequence + 1 });

  expect(rules.map((entry) => [entry.ruleID, entry.rule.rule.outcome])).toStrictEqual([
    ['deny-mail', 'deny'],
  ]);

  expect(records.map((read) => [read.record.kind, read.record.payload])).toStrictEqual([
    ['rules.change_rejected', { proposalID, reason: 'Mail stays blocked for now.' }],
  ]);
});

test('it refuses an answer to a rule change proposal it has no record of', async () => {
  const ctx = await setupTest();

  const result = await writeRuleProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'p-missing',
  });

  expect(result).toMatchObject({ status: 'refused', code: 'NOT_FOUND' });
});

test('it refuses an approval of a rule change proposal you rejected', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  await writeRuleProposalAnswer(ctx.context, { answer: 'reject', proposalID, reason: 'Not yet.' });

  const result = await writeRuleProposalAnswer(ctx.context, { answer: 'approve', proposalID });

  expect(result).toMatchObject({ status: 'refused', code: 'CLOSED' });
});

test('it refuses an approval of a rule change proposal past its lapse time', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  ctx.time.now += proposalLapseMs;

  const result = await writeRuleProposalAnswer(ctx.context, { answer: 'approve', proposalID });

  expect(result).toMatchObject({ status: 'refused', code: 'CLOSED' });
});

test('it refuses an approval of a rule change proposal that a later seed withdrew', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.*]\n',
  );

  await ctx.seed();

  const result = await writeRuleProposalAnswer(ctx.context, { answer: 'approve', proposalID });

  expect(result).toMatchObject({ status: 'refused', code: 'CLOSED' });
});

test('it asks again about a widening you rejected only once the definitions change it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  await writeRuleProposalAnswer(ctx.context, { answer: 'reject', proposalID, reason: 'Not yet.' });
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nShort replies.\n');

  await ctx.seed();

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.read]\n',
  );

  await ctx.seed();

  const proposals = await ctx.readProposals();

  expect(proposals.map((entry) => entry.outcome)).toStrictEqual(['rejected', null]);
});

test('it asks again about a widening you approved once the definitions narrow it and widen it back', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await ctx.readProposals();

  const proposalID = pending.at(-1)?.proposal.proposalID;

  invariant(proposalID);

  await writeRuleProposalAnswer(ctx.context, { answer: 'approve', proposalID });
  await writeFile(join(ctx.root, 'rules', 'web.yaml'), '# No web rules for now.\n');

  await ctx.seed();

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const proposals = await ctx.readProposals();

  expect(proposals.map((entry) => entry.outcome)).toStrictEqual(['approved', null]);
});
