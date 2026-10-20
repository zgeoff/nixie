import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import { writeSkillProposalLapses } from './write-skill-proposal-lapses';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-lapses-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it lapses a proposal left unanswered for 14 days, and keeps a younger one pending', async () => {
  const ctx = await setupTest();

  const olderAt = Date.UTC(2026, 2, 3, 9, 30);
  const youngerAt = Date.UTC(2026, 2, 4, 9, 30);

  setSystemTime(new Date(olderAt));
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

  setSystemTime(new Date(youngerAt));

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: 'hash-c',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Stars\n' }],
        untypedToken: null,
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const lapsed = await writeSkillProposalLapses({
    log: ctx.log,
    clock: buildTestClock(olderAt + 14 * 24 * 60 * 60 * 1000),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_lapsed'],
  });

  expect(lapsed).toBe(1);

  expect(records.map((entry) => entry.record)).toMatchObject([
    { kind: 'skills.write_lapsed', thread: 'conversation', payload: { proposalID: 'k3x9m2p7qa' } },
  ]);
});

test('it lapses no proposal twice, and none that an answer closed', async () => {
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
    {
      kind: 'skills.write_lapsed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
    },
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: 'hash-c',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Stars\n' }],
        untypedToken: null,
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
    {
      kind: 'skills.write_approved',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: {
        proposalID: 'p8w2n4c6ld',
        pullRequestURL: 'https://git.example.com/owner/definitions/pull/7',
      },
    },
  ]);

  const lapsed = await writeSkillProposalLapses({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 30 * 24 * 60 * 60 * 1000),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
  });

  expect(lapsed).toBe(0);
});
