import type { AnswerSettlement, ProposalFamily } from '@heynixie/proposals';
import { answerProposal } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import type { ProposalAPIContext } from './build-proposal-core-deps';
import { buildProposalCoreDeps } from './build-proposal-core-deps';

export interface LegacyParts {
  readonly runInForceSeed: () => Promise<unknown>;
}

export interface LegacyAnswer {
  readonly proposalID: string;

  // the hash that the route binds the answer to, when it has one
  readonly actionHash?: string;
  readonly choice: 'approve' | 'decline';
  readonly note?: string;
  readonly files?: readonly { readonly path: string; readonly text: string }[];
}

// The routes that predate the approvals namespace answer through the same checks, for one kind.
// They name no session beyond the caller they already verified, and no client action ID.
export async function answerLegacyProposal(
  context: ProposalAPIContext,
  parts: LegacyParts,
  family: ProposalFamily,
  answer: LegacyAnswer,
): Promise<AnswerSettlement> {
  const deps = buildProposalCoreDeps(context, { readMemory: () => null, ...parts });

  const outcome = await answerProposal(
    deps,
    {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash ?? null,
      choice: answer.choice,
      ...(answer.note === undefined ? {} : { note: answer.note }),
      ...(answer.files === undefined ? {} : { files: answer.files }),
      identityID: 'owner',
    },
    { family },
  );

  invariant(outcome.status !== 'unauthorized', 'a legacy answer names no caller check');

  return outcome;
}
