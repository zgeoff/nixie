import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { proposalLapseMs } from '@heynixie/proposals';
import { createPathSource } from '../definition/create-path-source';
import { runInForceSeed } from '../seed/run-in-force-seed';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { seedLegacyRuleProposal } from '../test-utils/seed-legacy-rule-proposal';
import { readRuleProposals } from './read-rule-proposals';
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
    runSeed: () =>
      runSeed({
        tasks: buildTestTaskSeed(),
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

test('it records your approval of a rule change proposal that an earlier release left pending', async () => {
  const ctx = await setupTest();
  const proposal = await seedLegacyRuleProposal(ctx.log);

  const result = await writeRuleProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: proposal.proposalID,
  });

  const records = await readRecords(ctx.log, { afterSequence: 1 });

  expect(result).toStrictEqual({ status: 'approved', proposalID: proposal.proposalID });

  expect(records.map((read) => [read.record.kind, read.record.payload])).toStrictEqual([
    ['rules.change_approved', { proposalID: proposal.proposalID }],
  ]);
});

test('it records your reason when you reject a rule change proposal', async () => {
  const ctx = await setupTest();
  const proposal = await seedLegacyRuleProposal(ctx.log);

  await writeRuleProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID: proposal.proposalID,
    reason: 'Mail stays blocked for now.',
  });

  const records = await readRecords(ctx.log, { afterSequence: 1 });

  expect(records.map((read) => [read.record.kind, read.record.payload])).toStrictEqual([
    [
      'rules.change_rejected',
      { proposalID: proposal.proposalID, reason: 'Mail stays blocked for now.' },
    ],
  ]);
});

test('it refuses an answer to a rule change proposal it has no record of', async () => {
  const ctx = await setupTest();

  const result = await writeRuleProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'p-missing',
  });

  expect(result).toStrictEqual({
    status: 'refused',
    code: 'NOT_FOUND',
    reason: expect.any(String),
  });
});

test('it refuses an approval of a rule change proposal you rejected', async () => {
  const ctx = await setupTest();
  const proposal = await seedLegacyRuleProposal(ctx.log);

  await writeRuleProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID: proposal.proposalID,
    reason: 'Not yet.',
  });

  const result = await writeRuleProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: proposal.proposalID,
  });

  expect(result).toStrictEqual({
    status: 'refused',
    code: 'PROPOSAL_CLOSED',
    reason: expect.any(String),
  });
});

test('it refuses an approval of a rule change proposal past its lapse time', async () => {
  const ctx = await setupTest();
  const proposal = await seedLegacyRuleProposal(ctx.log);

  ctx.time.now += proposalLapseMs;

  const result = await writeRuleProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: proposal.proposalID,
  });

  expect(result).toStrictEqual({
    status: 'refused',
    code: 'PROPOSAL_CLOSED',
    reason: expect.any(String),
  });
});

test('it refuses an approval of a rule change proposal that the next seed withdrew', async () => {
  const ctx = await setupTest();
  const proposal = await seedLegacyRuleProposal(ctx.log);

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.runSeed();

  const result = await writeRuleProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: proposal.proposalID,
  });

  expect(result).toStrictEqual({
    status: 'refused',
    code: 'PROPOSAL_CLOSED',
    reason: expect.any(String),
  });
});
