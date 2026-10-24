import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, writeRecords } from '@heynixie/log';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import { readPromptProposalAnswers } from './read-prompt-proposal-answers';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-answers-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it reads each answer on the thread with its prompt, its edits and the reason for a rejection', async () => {
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
      kind: 'prompts.override_approved',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: {
        proposalID: 'k3x9m2p7qa',
        approvalID: 'approval-a',
        proposalHash: 'hash-c',
        isEdited: true,
        approver: 'owner',
        channel: 'host',
      },
    },
    {
      kind: 'prompts.override_rejected',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'w7tn4c9rhz' },
      erasable: { reason: 'Keep the quote rule.' },
    },
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 0,
    through: 4,
  });

  expect(answers).toStrictEqual([
    {
      sequence: 3,
      at: expect.toBeNumber(),
      detail: {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        step: 'approved',
        isEdited: true,
        pullRequestURL: null,
        reason: null,
      },
    },
    {
      sequence: 4,
      at: expect.toBeNumber(),
      detail: {
        proposalID: 'w7tn4c9rhz',
        promptID: 'writer',
        step: 'rejected',
        isEdited: false,
        pullRequestURL: null,
        reason: 'Keep the quote rule.',
      },
    },
  ]);
});

test('it reads the export of an approved proposal with its pull request', async () => {
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
    {
      kind: 'prompts.override_exported',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: {
        proposalID: 'k3x9m2p7qa',
        approvalID: 'approval-a',
        pullRequestURL: 'https://definitions.test/pull/4',
      },
    },
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 0,
    through: 2,
  });

  expect(answers.map((answer) => answer.detail)).toStrictEqual([
    {
      proposalID: 'k3x9m2p7qa',
      promptID: 'compaction',
      step: 'exported',
      isEdited: false,
      pullRequestURL: 'https://definitions.test/pull/4',
      reason: null,
    },
  ]);
});

test('it never reads an answer on another thread', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'task-a',
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
      kind: 'prompts.override_lapsed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'task-a',
      payload: { proposalID: 'k3x9m2p7qa' },
    },
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 0,
    through: 2,
  });

  expect(answers).toStrictEqual([]);
});

test('it reads every answer in the range, past the size of one page of records', async () => {
  const ctx = await setupTest();

  const proposals = Array.from({ length: 1001 }, (_, index) => ({
    kind: 'prompts.override_proposed' as const,
    definitions: { snapshotHash: 'snapshot-a' },
    thread: 'conversation',
    payload: promptsOverrideProposedCodec.encode({
      proposalID: `proposal-${String(index)}`,
      promptID: 'compaction',
      proposalHash: 'hash-a',
      baseHash: null,
      entry: { _template: '{{ parts.safety }}' },
      files: [],
      reason: 'Drop the instruction part.',
      provenance: { runID: 'run-1', callID: `call-${String(index)}`, profile: 'standard' },
    }),
  }));

  const rejections = proposals.map((_, index) => ({
    kind: 'prompts.override_rejected' as const,
    definitions: { snapshotHash: 'snapshot-a' },
    thread: 'conversation',
    payload: { proposalID: `proposal-${String(index)}` },
  }));

  await writeRecords(ctx.log, [...proposals, ...rejections]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 1001,
    through: 2002,
  });

  expect(answers.map((answer) => answer.detail.proposalID)).toStrictEqual(
    rejections.map((rejection) => rejection.payload.proposalID),
  );
});
