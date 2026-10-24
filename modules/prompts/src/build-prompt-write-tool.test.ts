import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildPromptWriteTool } from './build-prompt-write-tool';
import type { CheckPromptProposal } from './types';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-write-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test("it records a proposal on the caller's thread and returns its short ID", async () => {
  const ctx = await setupTest();

  const tool = buildPromptWriteTool({
    log: ctx.log,
    readInForce: () => ({ snapshotHash: 'snapshot-a', personaVersion: 'persona-a', prompts: {} }),
    checkProposal: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'prompt_write',
      input: {
        id: 'compaction',
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_proposed'],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'pending',
      proposalID: expect.stringMatching(/^[a-z0-9]{10}$/u),
      message: expect.stringMatching(/^pending approval as [a-z0-9]{10}$/u),
    },
  });

  invariant(outcome.status === 'ok');

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'prompts.override_proposed',
      thread: 'conversation',
      definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
      payload: {
        proposalID: outcome.result['proposalID'],
        promptID: 'compaction',
        proposalHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      },
    },
  ]);
});

test('it records the hash of the override in force as the base of the proposal', async () => {
  const ctx = await setupTest();

  const tool = buildPromptWriteTool({
    log: ctx.log,
    readInForce: () => ({
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    }),
    checkProposal: () => [],
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'prompt_write',
      input: {
        id: 'compaction',
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_proposed'],
  });

  expect(records.map((entry) => entry.record.payload['baseHash'])).toStrictEqual([
    expect.stringMatching(/^[0-9a-f]{64}$/u),
  ]);
});

test('it passes the entry and the files to the definitions check, and refuses with every problem', async () => {
  const ctx = await setupTest();

  const checkProposal = mock<CheckPromptProposal>(() => [
    { path: 'nixie.yaml', reason: 'prompts.compaction: the prompt has no part tone' },
    { path: 'prompts/draft.md', reason: 'no part of prompts.compaction reads the file' },
  ]);

  const tool = buildPromptWriteTool({
    log: ctx.log,
    readInForce: () => ({ snapshotHash: 'snapshot-a', personaVersion: 'persona-a', prompts: {} }),
    checkProposal,
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'prompt_write',
      input: {
        id: 'compaction',
        entry: { tone: 'prompts/compaction-tone.md' },
        files: [{ path: 'prompts/draft.md', text: 'Be warm.\n' }],
        reason: 'Warmer summaries.',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_proposed'],
  });

  expect(checkProposal).toHaveBeenCalledExactlyOnceWith({
    id: 'compaction',
    entry: { tone: 'prompts/compaction-tone.md' },
    files: [{ path: 'prompts/draft.md', text: 'Be warm.\n' }],
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'the override fails the definitions checks: nixie.yaml: prompts.compaction: the prompt has no part tone; prompts/draft.md: no part of prompts.compaction reads the file',
  });

  expect(records).toStrictEqual([]);
});

test('it refuses a proposal with no reason', async () => {
  const ctx = await setupTest();

  const tool = buildPromptWriteTool({
    log: ctx.log,
    readInForce: () => ({ snapshotHash: 'snapshot-a', personaVersion: 'persona-a', prompts: {} }),
    checkProposal: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'prompt_write',
      input: {
        id: 'compaction',
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: '  ',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'a proposal needs a reason for the owner',
  });
});

test('it refuses a proposal before any definitions are in force', async () => {
  const ctx = await setupTest();

  const tool = buildPromptWriteTool({
    log: ctx.log,
    readInForce: () => null,
    checkProposal: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'prompt_write',
      input: {
        id: 'compaction',
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'no definitions are in force yet' });
});
