import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { buildPromptProposalHash } from './build-prompt-proposal-hash';
import { findPromptAnswerRefusal } from './find-prompt-answer-refusal';
import { PromptProposalCheckError } from './prompt-proposal-check-error';
import { promptsOverrideApprovedCodec } from './prompts-override-approved-codec';
import { promptsOverrideRejectedCodec } from './prompts-override-rejected-codec';
import { readPromptProposals } from './read-prompt-proposals';
import type {
  PromptAnswerContext,
  PromptPartFile,
  PromptProposalAnswer,
  PromptProposalAnswerResult,
  PromptProposalState,
  PromptsTables,
} from './types';

export function writePromptProposalAnswer(
  context: PromptAnswerContext,
  answer: PromptProposalAnswer,
): Promise<PromptProposalAnswerResult> {
  const log = context.log;

  return withWriteTransaction(log.writer, async (tx) => {
    const state = await readOpenProposal(tx, context, answer);

    if (answer.answer === 'reject') {
      await writeRecordsInTransaction(tx, log, [
        {
          definitions: context.definitions(),
          ...(state.thread === null ? {} : { thread: state.thread }),
          kind: 'prompts.override_rejected',
          payload: promptsOverrideRejectedCodec.encode({ proposalID: answer.proposalID }),
          erasable: { reason: answer.reason },
        },
      ]);

      return { proposalID: answer.proposalID, approvalID: null, proposalHash: null };
    }

    return writeApproval(tx, context, {
      state,
      entry: answer.entry ?? state.proposal.entry,
      files: answer.files ?? state.proposal.files,
    });
  });
}

async function readOpenProposal(
  tx: Transaction<unknown>,
  context: PromptAnswerContext,
  answer: PromptProposalAnswer,
): Promise<PromptProposalState> {
  const [state] = await readPromptProposals(tx, [answer.proposalID]);

  const currentHash =
    state === undefined
      ? null
      : buildPromptOverrideHash(context.readInForce()?.prompts[state.proposal.promptID]);

  const refusal = findPromptAnswerRefusal({
    answer,
    state,
    now: context.clock.now(),
    currentHash,
  });

  if (refusal !== null) {
    throw refusal;
  }

  invariant(state);

  return state;
}

interface Approval {
  readonly state: PromptProposalState;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
}

async function writeApproval(
  tx: Transaction<unknown>,
  context: PromptAnswerContext,
  approval: Approval,
): Promise<PromptProposalAnswerResult> {
  const proposal = approval.state.proposal;

  const problems = context.checkProposal({
    id: proposal.promptID,
    entry: approval.entry,
    files: approval.files,
  });

  if (problems.length > 0) {
    throw new PromptProposalCheckError(proposal.proposalID, problems);
  }

  const proposalHash = buildPromptProposalHash({
    promptID: proposal.promptID,
    entry: approval.entry,
    files: approval.files,
  });

  const approvalID = crypto.randomUUID();
  const approvedAt = context.clock.now();
  const tables = tx.$extendTables<PromptsTables>();

  await tables
    .updateTable('prompt_approvals')
    .set({ state: 'superseded', updated_at: approvedAt })
    .where('prompt_id', '=', proposal.promptID)
    .where('state', '=', 'current')
    .execute();

  await tables
    .insertInto('prompt_approvals')
    .values({
      approval_id: approvalID,
      proposal_id: proposal.proposalID,
      prompt_id: proposal.promptID,
      thread: approval.state.thread,
      entry: JSON.stringify(approval.entry),
      files: JSON.stringify(approval.files),
      state: 'current',
      approved_at: approvedAt,
      updated_at: approvedAt,
    })
    .execute();

  await writeRecordsInTransaction(tx, context.log, [
    {
      definitions: context.definitions(),
      ...(approval.state.thread === null ? {} : { thread: approval.state.thread }),
      kind: 'prompts.override_approved',
      payload: promptsOverrideApprovedCodec.encode({
        proposalID: proposal.proposalID,
        approvalID,
        proposalHash,
        isEdited: proposalHash !== proposal.proposalHash,
        approver: 'owner',
        channel: 'host',
      }),
    },
  ]);

  return { proposalID: proposal.proposalID, approvalID, proposalHash };
}
