import type { LegacyCaller } from './answer-legacy-proposal';
import { answerLegacyProposal } from './answer-legacy-proposal';
import type { ProposalAPIContext } from './build-proposal-core-deps';
import type { ActionProposalAnswer, ActionProposalResult } from './write-action-proposal-answer';

// An answer lands in the inbox of the task that asked, so the task hears it. An approval runs
// nothing yet.
export async function runActionProposalAnswer(
  context: ProposalAPIContext,
  request: ActionProposalAnswer,
  caller?: LegacyCaller,
): Promise<ActionProposalResult> {
  const settlement = await answerLegacyProposal(
    context,
    {
      runInForceSeed: () => Promise.resolve(),
      ...(caller === undefined ? {} : { caller }),
    },
    'action',
    {
      proposalID: request.proposalID,
      choice: request.answer === 'approve' ? 'approve' : 'decline',
      ...(request.answer === 'reject' && request.reason !== null ? { note: request.reason } : {}),
    },
  );

  if (settlement.status === 'answered') {
    return {
      status: request.answer === 'approve' ? 'approved' : 'declined',
      proposalID: request.proposalID,
    };
  }

  return settlement.refusal.error === 'NOT_FOUND'
    ? { status: 'refused', code: 'NOT_FOUND', reason: 'nothing has that ID' }
    : {
        status: 'refused',
        code: 'PROPOSAL_CLOSED',
        reason: 'the proposal is answered or lapsed',
      };
}
