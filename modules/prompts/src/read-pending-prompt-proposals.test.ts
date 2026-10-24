import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import { readPendingPromptProposals } from './read-pending-prompt-proposals';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-pending-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it lists a pending proposal with its lapse time and the override in force for its prompt', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);
  const override = { parts: { safety: 'Answer in one line.' }, template: null };

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
        baseHash: buildPromptOverrideHash(override),
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const pending = await readPendingPromptProposals({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 1000),
    readInForce: () => ({
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      prompts: { compaction: override },
    }),
  });

  expect(pending).toStrictEqual([
    {
      proposal: {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: buildPromptOverrideHash(override),
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      },
      thread: 'conversation',
      proposedAt,
      lapseAt: proposedAt + 14 * 24 * 60 * 60 * 1000,
      isStale: false,
      inForce: override,
    },
  ]);
});

test('it marks a proposal stale once the override in force for its prompt moves', async () => {
  const ctx = await setupTest();

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

  const pending = await readPendingPromptProposals({
    log: ctx.log,
    clock: buildTestClock(Date.now()),
    readInForce: () => ({
      snapshotHash: 'snapshot-b',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    }),
  });

  expect(pending.map((entry) => entry.isStale)).toStrictEqual([true]);
});

test('it leaves out a proposal that an answer closed or that waited past its lapse time', async () => {
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
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'w7tn4c9rhz',
        promptID: 'writer',
        proposalHash: 'hash-b',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-2', profile: 'standard' },
      }),
    },
    {
      kind: 'prompts.override_rejected',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'w7tn4c9rhz' },
    },
  ]);

  const pending = await readPendingPromptProposals({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000),
    readInForce: () => null,
  });

  expect(pending).toStrictEqual([]);
});
