import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { buildPromptProposalHash } from './build-prompt-proposal-hash';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import type { CheckPromptProposal, PromptsTables } from './types';
import { writePromptProposalAnswer } from './write-prompt-proposal-answer';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-answer-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it records an approval that names you, and stores the override for the export', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { safety: 'prompts/compaction-safety.md' },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const result = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_approved'],
  });

  const approvals = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .selectAll()
    .execute();

  expect(result).toStrictEqual({
    status: 'approved',
    proposalID: 'k3x9m2p7qa',
    approvalID: expect.toBeString(),
    proposalHash,
  });

  invariant(result.status === 'approved');

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'prompts.override_approved',
      thread: 'conversation',
      payload: {
        proposalID: 'k3x9m2p7qa',
        approvalID: result.approvalID,
        proposalHash,
        isEdited: false,
        approver: 'owner',
        channel: 'host',
      },
    },
  ]);

  expect(approvals).toStrictEqual([
    {
      approval_id: result.approvalID,
      proposal_id: 'k3x9m2p7qa',
      prompt_id: 'compaction',
      thread: 'conversation',
      entry: '{"safety":"prompts/compaction-safety.md"}',
      files: '[{"path":"prompts/compaction-safety.md","text":"Answer with the summary alone.\\n"}]',
      state: 'current',
      approved_at: 1000,
      updated_at: 1000,
    },
  ]);
});

test('it approves edited files and entry in place of the proposal, checks them, and records that they are edited', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { safety: 'prompts/compaction-safety.md' },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const checkProposal = mock<CheckPromptProposal>(() => []);

  const result = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal,
    },
    {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      proposalHash,
      entry: {
        safety: 'prompts/compaction-safety.md',
        _template: '{{ parts.instruction }}\n\n{{ parts.safety }}',
      },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Answer in one paragraph.\n' }],
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_approved'],
  });

  const approvals = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select(['entry', 'files'])
    .execute();

  expect(checkProposal).toHaveBeenCalledExactlyOnceWith({
    id: 'compaction',
    entry: {
      safety: 'prompts/compaction-safety.md',
      _template: '{{ parts.instruction }}\n\n{{ parts.safety }}',
    },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer in one paragraph.\n' }],
  });

  invariant(result.status === 'approved');

  expect(result.proposalHash).toBe(
    buildPromptProposalHash({
      promptID: 'compaction',
      entry: {
        safety: 'prompts/compaction-safety.md',
        _template: '{{ parts.instruction }}\n\n{{ parts.safety }}',
      },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Answer in one paragraph.\n' }],
    }),
  );

  expect(records.map((entry) => entry.record.payload['isEdited'])).toStrictEqual([true]);

  expect(approvals).toStrictEqual([
    {
      entry:
        '{"safety":"prompts/compaction-safety.md","_template":"{{ parts.instruction }}\\n\\n{{ parts.safety }}"}',
      files: '[{"path":"prompts/compaction-safety.md","text":"Answer in one paragraph.\\n"}]',
    },
  ]);
});

test('it refuses edits that fail the definitions check, and records nothing', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { safety: 'prompts/compaction-safety.md' },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [
        {
          path: 'nixie.yaml',
          reason: 'prompts.compaction.safety: the definitions hold no file prompts/other.md',
        },
      ],
    },
    {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      proposalHash,
      entry: { safety: 'prompts/other.md' },
    },
  );

  const approvals = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .selectAll()
    .execute();

  expect(refusal).toStrictEqual({
    status: 'refused',
    proposalID: 'k3x9m2p7qa',
    code: 'PROMPT_CHECK',
    reason:
      'the override approved for prompt proposal k3x9m2p7qa fails the definitions checks: nixie.yaml: prompts.compaction.safety: the definitions hold no file prompts/other.md',
    problems: [
      {
        path: 'nixie.yaml',
        reason: 'prompts.compaction.safety: the definitions hold no file prompts/other.md',
      },
    ],
  });

  expect(approvals).toStrictEqual([]);
});

test('it supersedes the approval of the same prompt before it', async () => {
  const ctx = await setupTest();

  const firstHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  const secondHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: firstHash,
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
        promptID: 'compaction',
        proposalHash: secondHash,
        baseHash: null,
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-1', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const context = {
    log: ctx.log,
    clock: buildTestClock(1000),
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
    readInForce: () => null,
    checkProposal: () => [],
  };

  await writePromptProposalAnswer(context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: firstHash,
  });

  await writePromptProposalAnswer(context, {
    answer: 'approve',
    proposalID: 'w7tn4c9rhz',
    proposalHash: secondHash,
  });

  const approvals = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select(['proposal_id', 'state'])
    .orderBy('proposal_id')
    .execute();

  expect(approvals).toStrictEqual([
    { proposal_id: 'k3x9m2p7qa', state: 'superseded' },
    { proposal_id: 'w7tn4c9rhz', state: 'current' },
  ]);
});

test('it records a rejection with its reason in the erasable fields, and stores no override', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const result = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [],
    },
    {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      proposalHash,
      reason: 'The summary needs its carry-forward list.',
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_rejected'],
  });

  const approvals = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .selectAll()
    .execute();

  expect(result).toStrictEqual({ status: 'rejected', proposalID: 'k3x9m2p7qa' });

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'prompts.override_rejected',
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
      erasable: {
        status: 'readable',
        fields: { reason: 'The summary needs its carry-forward list.' },
      },
    },
  ]);

  expect(approvals).toStrictEqual([]);
});

test('it refuses an answer to a proposal that does not exist', async () => {
  const ctx = await setupTest();

  const refusal = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash: 'hash-a' },
  );

  expect(refusal).toStrictEqual({
    status: 'refused',
    proposalID: 'k3x9m2p7qa',
    code: 'NOT_FOUND',
    reason: 'no prompt proposal k3x9m2p7qa exists',
    problems: [],
  });
});

test('it refuses an answer to a proposal that a rejection closed', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
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

  const refusal = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash },
  );

  expect(refusal).toStrictEqual({
    status: 'refused',
    proposalID: 'k3x9m2p7qa',
    code: 'PROPOSAL_CLOSED',
    reason: 'prompt proposal k3x9m2p7qa is rejected, so it takes no answer',
    problems: [],
  });
});

test('it refuses an answer to a proposal past its lapse time as lapsed', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(Date.now() + 14 * 24 * 60 * 60 * 1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash },
  );

  expect(refusal).toStrictEqual({
    status: 'refused',
    proposalID: 'k3x9m2p7qa',
    code: 'PROPOSAL_CLOSED',
    reason: 'prompt proposal k3x9m2p7qa is lapsed, so it takes no answer',
    problems: [],
  });
});

test('it refuses an answer under another proposal hash', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: () => [],
    },
    { answer: 'reject', proposalID: 'k3x9m2p7qa', proposalHash: 'hash-b', reason: 'No.' },
  );

  expect(refusal).toStrictEqual({
    status: 'refused',
    proposalID: 'k3x9m2p7qa',
    code: 'PROPOSAL_HASH',
    reason: 'the answer to prompt proposal k3x9m2p7qa names another proposal hash',
    problems: [],
  });
});

test('it refuses an approval once the override in force moved past the base of the proposal', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-b' }),
      readInForce: () => ({
        snapshotHash: 'snapshot-b',
        personaVersion: 'persona-a',
        prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
      }),
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash },
  );

  expect(refusal).toStrictEqual({
    status: 'refused',
    proposalID: 'k3x9m2p7qa',
    code: 'STALE_BASE',
    reason: 'the override in force moved past the one prompt proposal k3x9m2p7qa replaces',
    problems: [],
  });
});

test('it records a rejection of a proposal whose base the override in force moved past', async () => {
  const ctx = await setupTest();

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const result = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-b' }),
      readInForce: () => ({
        snapshotHash: 'snapshot-b',
        personaVersion: 'persona-a',
        prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
      }),
      checkProposal: () => [],
    },
    {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      proposalHash,
      reason: 'The override in force already covers it.',
    },
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_rejected'],
  });

  expect(result).toStrictEqual({ status: 'rejected', proposalID: 'k3x9m2p7qa' });

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { reason: 'The override in force already covers it.' } },
  ]);
});

test('it approves a proposal whose base is the override in force', async () => {
  const ctx = await setupTest();

  const override = { parts: { safety: 'Answer in one line.' }, template: null };

  const proposalHash = buildPromptProposalHash({
    promptID: 'compaction',
    entry: { _template: '{{ parts.safety }}' },
    files: [],
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash,
        baseHash: buildPromptOverrideHash(override),
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const result = await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: buildTestClock(1000),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => ({
        snapshotHash: 'snapshot-a',
        personaVersion: 'persona-a',
        prompts: { compaction: override },
      }),
      checkProposal: () => [],
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash },
  );

  expect(result).toStrictEqual({
    status: 'approved',
    proposalID: 'k3x9m2p7qa',
    approvalID: expect.toBeString(),
    proposalHash,
  });
});
