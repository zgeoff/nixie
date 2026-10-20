import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { SkillProposalClosedError } from './skill-proposal-closed-error';
import { SkillProposalHashError } from './skill-proposal-hash-error';
import { SkillProposalNotFoundError } from './skill-proposal-not-found-error';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import { writeSkillProposalAnswer } from './write-skill-proposal-answer';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-answer-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it records an approval with its pull request on the thread of the proposal', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writeSkillProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(Date.now()),
      definitions: () => ({ snapshotHash: 'snapshot-b' }),
    },
    {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      pullRequestURL: 'https://git.example.com/owner/definitions/pull/7',
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'skills.write_approved',
      thread: 'conversation',
      definitions: { snapshotHash: 'snapshot-b' },
      payload: {
        proposalID: 'k3x9m2p7qa',
        pullRequestURL: 'https://git.example.com/owner/definitions/pull/7',
      },
    },
  ]);
});

test('it records a rejection with your reason in its erasable fields', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writeSkillProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(Date.now()),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      reason: 'the harbour tables come from a feed',
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_rejected'],
  });

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'skills.write_rejected',
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
      erasable: {
        status: 'readable',
        fields: { reason: 'the harbour tables come from a feed' },
      },
    },
  ]);
});

test('it closes a proposal once when an approval and a rejection arrive together', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const context = {
    log: ctx.log,
    clock: buildTestClock(Date.now()),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
  };

  const settled = await Promise.allSettled([
    writeSkillProposalAnswer(context, {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      pullRequestURL: 'https://git.example.com/owner/definitions/pull/7',
    }),
    writeSkillProposalAnswer(context, {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      reason: 'not now',
    }),
  ]);

  const closing = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved', 'skills.write_rejected'],
  });

  expect(settled.map((result) => result.status)).toIncludeSameMembers(['fulfilled', 'rejected']);

  expect(settled.filter((result) => result.status === 'rejected')).toMatchObject([
    { reason: { code: 'PROPOSAL_CLOSED' } },
  ]);

  expect(closing).toHaveLength(1);
});

test('it refuses an answer to a proposal no record holds', async () => {
  const ctx = await setupTest();

  const refusal = await writeSkillProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(Date.now()),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      reason: 'not now',
    },
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(SkillProposalNotFoundError);
});

test('it refuses a second answer to a proposal an answer closed', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
    {
      kind: 'skills.write_rejected',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
    },
  ]);

  // the refusal settles before the writer stops, so its transaction never outlives the test
  const refusal = await writeSkillProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(Date.now()),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      pullRequestURL: 'https://git.example.com/owner/definitions/pull/7',
    },
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(SkillProposalClosedError);
  expect(refusal).toMatchObject({ code: 'PROPOSAL_CLOSED', outcome: 'rejected' });
});

test('it refuses an answer to a proposal whose lapse time has come', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writeSkillProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      reason: 'not now',
    },
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(SkillProposalClosedError);
  expect(refusal).toMatchObject({ code: 'PROPOSAL_CLOSED', outcome: 'lapsed' });
});

test('it refuses an answer that names another skill hash, and records nothing', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writeSkillProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(Date.now()),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-a',
      pullRequestURL: 'https://git.example.com/owner/definitions/pull/7',
    },
  ).then(
    () => null,
    (error: unknown) => error,
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  expect(refusal).toBeInstanceOf(SkillProposalHashError);
  expect(records).toStrictEqual([]);
});
