import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalAnswerInput } from '@heynixie/proposals';
import { answerProposal, proposeInTransaction, readProposal } from '@heynixie/proposals';
import { startTestProposals } from '@heynixie/proposals/test-utils';
import { promptsOverrideProposedCodec } from '../override/prompts-override-proposed-codec';
import type { CheckPromptProposal, PromptsInForce, PromptsTables } from '../types';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { buildPromptProposalHash } from './build-prompt-proposal-hash';
import { makePromptProposalHandler } from './make-prompt-proposal-handler';
import { mapPromptProposalRecord } from './map-prompt-proposal-record';

interface Setup {
  readonly inForce?: PromptsInForce | null;
  readonly checkProposal?: CheckPromptProposal;
}

interface ProposeSetup {
  readonly baseHash: string | null;
}

async function setupTest(setup: Setup = {}) {
  const entry = { _template: '{{ parts.safety }}' };
  const wakes = { count: 0 };

  // the handler's own deps are the core's, so one clock and one log serve both
  const base = await startTestProposals({ mappers: [mapPromptProposalRecord] });

  const context = {
    log: base.log,
    clock: base.clock,
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
    readInForce: () => setup.inForce ?? null,
    checkProposal: setup.checkProposal ?? (() => []),
    wakeExports: () => {
      wakes.count += 1;
    },
  };

  const proposals = await startTestProposals({
    mappers: [mapPromptProposalRecord],
    handlers: [makePromptProposalHandler(context)],
  });

  const deps = { ...proposals.deps, clock: base.clock, log: base.log };

  return {
    ...proposals,
    deps,
    wakes,
    context,
    propose: async (input: ProposeSetup) => {
      const proposalHash = buildPromptProposalHash({ promptID: 'compaction', entry, files: [] });

      const created = await withWriteTransaction(base.log.writer, async (tx) => {
        const proposed = await proposeInTransaction(deps, tx, {
          family: 'prompt',
          kind: 'internal_change',
          cause: 'prompt_override',
          riskClass: 'always_ask',
          actionHash: proposalHash,
          ruleHash: null,
          thread: 'conversation',
          taskID: null,
          deadlineAt: null,
          sameThing: 'compaction',
        });

        await writeRecordsInTransaction(tx, base.log, [
          {
            kind: 'prompts.override_proposed',
            thread: 'conversation',
            definitions: { snapshotHash: 'snapshot-a' },
            payload: promptsOverrideProposedCodec.encode({
              proposalID: proposed.proposalID,
              promptID: 'compaction',
              proposalHash,
              baseHash: input.baseHash,
              entry,
              files: [],
              reason: 'Drop the instruction part.',
              provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
            }),
          },
        ]);

        return proposed;
      });

      return { proposalID: created.proposalID, proposalHash };
    },
    answer: (input: Partial<ProposalAnswerInput> & Pick<ProposalAnswerInput, 'proposalID'>) =>
      answerProposal(
        deps,
        { actionHash: null, choice: 'approve', identityID: 'owner', ...input },
        { family: 'prompt', passkey: { kind: 'host' } },
      ),
    readRow: (proposalID: string) => readProposal(base.log.writer.db, proposalID),
    readApprovals: () =>
      base.log.writer.db
        .$extendTables<PromptsTables>()
        .selectFrom('prompt_approvals')
        .select(['approval_id', 'state'])
        .orderBy('approved_at')
        .execute(),
    readApprovedRecords: () =>
      readRecords(base.log, { afterSequence: 0, kinds: ['prompts.override_approved'] }),
  };
}

test('it approves an override, records it on the browser channel and wakes the export', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose({ baseHash: null });

  const outcome = await ctx.answer({
    proposalID: proposed.proposalID,
    actionHash: proposed.proposalHash,
    channel: 'browser',
  });

  const approvals = await ctx.readApprovals();
  const records = await ctx.readApprovedRecords();

  expect(outcome).toStrictEqual({
    status: 'answered',
    result: { proposalID: proposed.proposalID, state: 'approved' },
  });

  expect(records.map((item) => item.record.payload)).toMatchObject([
    {
      proposalID: proposed.proposalID,
      approvalID: approvals[0]?.approval_id,
      isEdited: false,
      channel: 'browser',
      identityID: 'owner',
    },
  ]);

  const row = await ctx.readRow(proposed.proposalID);

  expect([ctx.wakes.count, row?.usedBy]).toStrictEqual([1, approvals[0]?.approval_id]);
});

test('it records a host command approval on the host channel', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose({ baseHash: null });

  await ctx.answer({ proposalID: proposed.proposalID });

  const records = await ctx.readApprovedRecords();

  expect(records.map((item) => item.record.payload)).toMatchObject([{ channel: 'host' }]);
});

test('it refuses an approval once the override in force moved past the base of the proposal', async () => {
  const ctx = await setupTest({
    inForce: {
      snapshotHash: 'snapshot-b',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    },
  });

  const proposed = await ctx.propose({ baseHash: null });

  const outcome = await ctx.answer({
    proposalID: proposed.proposalID,
    actionHash: proposed.proposalHash,
  });

  expect(outcome).toMatchObject({ status: 'refused', refusal: { error: 'CONFLICT' } });

  const approvals = await ctx.readApprovals();

  expect(approvals).toStrictEqual([]);

  const row = await ctx.readRow(proposed.proposalID);

  expect(row?.state).toBe('pending');
});

test('it declines a proposal whose base the override in force moved past, with the hash on its card', async () => {
  const ctx = await setupTest({
    inForce: {
      snapshotHash: 'snapshot-b',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    },
  });

  const proposed = await ctx.propose({ baseHash: null });

  const outcome = await ctx.answer({
    proposalID: proposed.proposalID,
    actionHash: proposed.proposalHash,
    choice: 'decline',
    note: 'The override in force already covers it.',
  });

  expect(outcome).toStrictEqual({
    status: 'answered',
    result: { proposalID: proposed.proposalID, state: 'declined' },
  });

  const row = await ctx.readRow(proposed.proposalID);

  expect(row?.state).toBe('declined');
});

test('it approves a proposal whose base is the override in force', async () => {
  const ctx = await setupTest({
    inForce: {
      snapshotHash: 'snapshot-a',
      personaVersion: 'persona-a',
      prompts: { compaction: { parts: { safety: 'Answer in one line.' }, template: null } },
    },
  });

  const proposed = await ctx.propose({
    baseHash: buildPromptOverrideHash({ parts: { safety: 'Answer in one line.' }, template: null }),
  });

  const outcome = await ctx.answer({
    proposalID: proposed.proposalID,
    actionHash: proposed.proposalHash,
  });

  expect(outcome).toMatchObject({ status: 'answered', result: { state: 'approved' } });
});

test('it refuses an answer under another proposal hash', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose({ baseHash: null });
  const outcome = await ctx.answer({ proposalID: proposed.proposalID, actionHash: 'other-hash' });

  expect(outcome).toMatchObject({ status: 'refused', refusal: { error: 'CONFLICT' } });
});

test('it refuses edits that fail the definitions check, and records nothing', async () => {
  const ctx = await setupTest({
    checkProposal: () => [{ path: 'prompts/compaction-safety.md', reason: 'too long' }],
  });

  const proposed = await ctx.propose({ baseHash: null });

  const outcome = await ctx.answer({
    proposalID: proposed.proposalID,
    prompt: { files: [{ path: 'prompts/compaction-safety.md', text: 'x' }] },
  });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'prompt_check' },
  });

  const approvals = await ctx.readApprovals();

  expect(approvals).toStrictEqual([]);
});

test('it supersedes the approval of the same prompt before it', async () => {
  const ctx = await setupTest();
  const first = await ctx.propose({ baseHash: null });

  await ctx.answer({ proposalID: first.proposalID });

  const second = await ctx.propose({ baseHash: null });

  await ctx.answer({ proposalID: second.proposalID });

  const approvals = await ctx.readApprovals();

  expect(approvals.map((approval) => approval.state)).toStrictEqual(['superseded', 'current']);
});
