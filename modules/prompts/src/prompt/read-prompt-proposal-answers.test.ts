import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RecordInput } from '@heynixie/log';
import { startWriter, writeRecords } from '@heynixie/log';
import { buildProposalsProjection } from '@heynixie/proposals';
import { promptsOverrideProposedCodec } from '../override/prompts-override-proposed-codec';
import { mapPromptProposalRecord } from './map-prompt-proposal-record';
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

  const definitions = { snapshotHash: 'snapshot-a' };

  const proposed = (proposalID: string, thread: string): RecordInput => ({
    kind: 'prompts.override_proposed',
    definitions,
    thread,
    payload: promptsOverrideProposedCodec.encode({
      proposalID,
      promptID: 'compaction',
      proposalHash: 'hash-a',
      baseHash: null,
      entry: { _template: '{{ parts.safety }}' },
      files: [],
      reason: 'Drop the instruction part.',
      provenance: { runID: 'run-1', callID: `call-${proposalID}`, profile: 'standard' },
    }),
  });

  const exported = (proposalID: string, thread: string): RecordInput => ({
    kind: 'prompts.override_exported',
    definitions,
    thread,
    payload: {
      proposalID,
      approvalID: `approval-${proposalID}`,
      pullRequestURL: `https://definitions.test/pull/${proposalID}`,
    },
  });

  return {
    proposed,
    exported,
    log: {
      writer,
      deploymentKey,
      projections: [buildProposalsProjection([mapPromptProposalRecord])],
    },
  };
}

test('it reads the export of an approved proposal with its prompt and its pull request', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    ctx.proposed('k3x9m2p7qa', 'conversation'),
    ctx.exported('k3x9m2p7qa', 'conversation'),
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 0,
    through: 2,
  });

  expect(answers).toStrictEqual([
    {
      sequence: 2,
      at: expect.toBeNumber(),
      detail: {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        step: 'exported',
        isEdited: false,
        pullRequestURL: 'https://definitions.test/pull/k3x9m2p7qa',
        reason: null,
      },
    },
  ]);
});

test('it never reads an export on another thread', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    ctx.proposed('k3x9m2p7qa', 'task-a'),
    ctx.exported('k3x9m2p7qa', 'task-a'),
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 0,
    through: 2,
  });

  expect(answers).toStrictEqual([]);
});

test('it reads the exports through the end of the range and none after it', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    ctx.proposed('k3x9m2p7qa', 'conversation'),
    ctx.proposed('w7tn4c9rhz', 'conversation'),
    ctx.exported('k3x9m2p7qa', 'conversation'),
    ctx.exported('w7tn4c9rhz', 'conversation'),
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 0,
    through: 3,
  });

  expect(answers.map((answer) => answer.detail.proposalID)).toStrictEqual(['k3x9m2p7qa']);
});

test('it reads every export in the range, past the size of one page of records', async () => {
  const ctx = await setupTest();

  const ids = Array.from({ length: 1001 }, (_, index) => `proposal-${String(index)}`);

  await writeRecords(ctx.log, [
    ...ids.map((id) => ctx.proposed(id, 'conversation')),
    ...ids.map((id) => ctx.exported(id, 'conversation')),
  ]);

  const answers = await readPromptProposalAnswers(ctx.log, 'conversation', {
    after: 1001,
    through: 2002,
  });

  expect(answers.map((answer) => answer.detail.proposalID)).toStrictEqual(ids);
});
