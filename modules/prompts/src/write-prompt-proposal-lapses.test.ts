import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import { writePromptProposalLapses } from './write-prompt-proposal-lapses';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-lapses-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it lapses a pending proposal 14 days after it was proposed, on its own thread', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const count = await writePromptProposalLapses({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
  });

  const lapses = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_lapsed'],
  });

  expect(count).toBe(1);

  expect(lapses.map((entry) => entry.record)).toMatchObject([
    { thread: 'conversation', payload: { proposalID: 'k3x9m2p7qa' } },
  ]);
});

test('it leaves a proposal younger than 14 days pending', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const count = await writePromptProposalLapses({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000 - 1),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
  });

  expect(count).toBe(0);
});

test('it never lapses a proposal that an answer closed', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
    {
      kind: 'prompts.override_rejected',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
    },
  ]);

  const count = await writePromptProposalLapses({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 30 * 24 * 60 * 60 * 1000),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
  });

  expect(count).toBe(0);
});
