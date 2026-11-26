import { expect, mock, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPromptProposal } from '@heynixie/definitions';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import type { PromptsInForce } from '@heynixie/prompts';
import {
  mapPromptProposalRecord,
  promptsOverrideProposedCodec,
  readPromptApproval,
} from '@heynixie/prompts';
import { buildProposalsProjection } from '@heynixie/proposals';
import { createRouterClient } from '@orpc/server';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createHostPromptProposalProcedures } from './create-host-prompt-proposal-procedures';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-host-prompt-proposals-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = {
    writer,
    deploymentKey,
    projections: [buildProposalsProjection([mapPromptProposalRecord])],
  };

  const clock = createFakeClock({ startMs: Date.UTC(2026, 2, 3, 10, 0) });
  const wakeExports = mock(() => {});

  const createClient = (inForce: PromptsInForce | null) =>
    createRouterClient(
      createHostPromptProposalProcedures({
        log,
        clock,
        definitions: () => ({ snapshotHash: 'snapshot-a' }),
        readInForce: () => inForce,
        checkProposal: checkPromptProposal,
        wakeExports,
      }),
    );

  return { log, createClient, wakeExports };
}

test('#list lists each pending proposal with its files, its reason, the override in force and the hash an answer binds to', async () => {
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
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Quote each fact word for word.\n' }],
        reason: 'The quote rule reads too loosely.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const client = ctx.createClient({
    snapshotHash: 'snapshot-a',
    personaVersion: 'persona-a',
    prompts: { compaction: { parts: { safety: 'Quote every fact.' }, template: null } },
  });

  const pending = await client.list();

  expect(pending).toStrictEqual([
    {
      proposalID: 'p8w2n4c6ld',
      promptID: 'compaction',
      proposalHash: 'hash-c',
      baseHash: null,
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Quote each fact word for word.\n' }],
      reason: 'The quote rule reads too loosely.',
      inForce: { parts: { safety: 'Quote every fact.' }, template: null },
      thread: 'conversation',
      provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      createdAt: new Date(proposedAt),
      lapseAt: new Date(proposedAt + 14 * 24 * 60 * 60 * 1000),
      isStale: true,
    },
  ]);
});

test('#approve records the approval that names you, then wakes the definitions export', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const result = await ctx
    .createClient(null)
    .approve({ proposalID: 'p8w2n4c6ld', proposalHash: 'hash-c' });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_approved'],
  });

  expect(result).toStrictEqual({
    proposalID: 'p8w2n4c6ld',
    approvalID: expect.toBeString(),
    proposalHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
  });

  expect(records.map((entry) => entry.record.payload)).toMatchObject([
    { proposalID: 'p8w2n4c6ld', approvalID: result.approvalID, approver: 'owner' },
  ]);

  expect(ctx.wakeExports).toHaveBeenCalledOnce();
});

test('#approve stores the edited files in place of the proposed ones, and records the edit', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const approved = await ctx.createClient(null).approve({
    proposalID: 'p8w2n4c6ld',
    proposalHash: 'hash-c',
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer in one line.\n' }],
  });

  const approval = await readPromptApproval(ctx.log.writer.db, approved.approvalID);

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_approved'],
  });

  expect({ entry: approval.entry, files: approval.files }).toStrictEqual({
    entry: { safety: 'prompts/compaction-safety.md' },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer in one line.\n' }],
  });

  expect(records.map((entry) => entry.record.payload['isEdited'])).toStrictEqual([true]);
});

test('#approve refuses an edited entry that fails the definitions checks with its code', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const settled = await Promise.allSettled([
    ctx.createClient(null).approve({
      proposalID: 'p8w2n4c6ld',
      proposalHash: 'hash-c',
      entry: { _template: '{{ owner.birthday }}' },
    }),
  ]);

  expect(settled).toMatchObject([
    { status: 'rejected', reason: { code: 'PROMPT_CHECK', status: 400 } },
  ]);

  expect(ctx.wakeExports).not.toHaveBeenCalled();
});

test('#approve refuses a proposal whose base the override in force moved past with its code', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const client = ctx.createClient({
    snapshotHash: 'snapshot-a',
    personaVersion: 'persona-a',
    prompts: { compaction: { parts: { safety: 'Quote every fact.' }, template: null } },
  });

  const settled = await Promise.allSettled([
    client.approve({ proposalID: 'p8w2n4c6ld', proposalHash: 'hash-c' }),
  ]);

  expect(settled).toMatchObject([
    { status: 'rejected', reason: { code: 'STALE_BASE', status: 409 } },
  ]);
});

test('#reject records the rejection with your reason', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const result = await ctx.createClient(null).reject({
    proposalID: 'p8w2n4c6ld',
    proposalHash: 'hash-c',
    reason: 'The compaction needs its safety part.',
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['proposals.settled'],
  });

  expect(result).toStrictEqual({ proposalID: 'p8w2n4c6ld' });

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    {
      status: 'readable',
      fields: {
        reason: 'The compaction needs its safety part.',
        sentence: 'Override the prompt compaction.',
      },
    },
  ]);
});

test('#reject answers a proposal that does not exist with its typed code', async () => {
  const ctx = await setupTest();

  const settled = await Promise.allSettled([
    ctx
      .createClient(null)
      .reject({ proposalID: 'p8w2n4c6ld', proposalHash: 'hash-c', reason: 'No.' }),
  ]);

  expect(settled).toMatchObject([
    { status: 'rejected', reason: { code: 'NOT_FOUND', status: 404 } },
  ]);
});

test('#reject refuses an answer under another proposal hash with its code', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const settled = await Promise.allSettled([
    ctx
      .createClient(null)
      .reject({ proposalID: 'p8w2n4c6ld', proposalHash: 'hash-d', reason: 'No.' }),
  ]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'PROPOSAL_HASH',
        status: 409,
        message: 'the prompt proposal p8w2n4c6ld cannot take this answer',
      },
    },
  ]);
});

test('#approve refuses a proposal that a rejection closed with its code', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        promptID: 'compaction',
        proposalHash: 'hash-c',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
    {
      kind: 'prompts.override_rejected',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'p8w2n4c6ld' },
    },
  ]);

  const settled = await Promise.allSettled([
    ctx.createClient(null).approve({ proposalID: 'p8w2n4c6ld', proposalHash: 'hash-c' }),
  ]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'PROPOSAL_CLOSED',
        status: 409,
        message: 'the prompt proposal p8w2n4c6ld cannot take this answer',
      },
    },
  ]);

  expect(ctx.wakeExports).not.toHaveBeenCalled();
});
