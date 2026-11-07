import { store } from './store';

export type MockRuleProposalAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string };

export type MockRuleProposalResult =
  | { readonly status: 'answered'; readonly proposalID: string }
  | { readonly status: 'refused'; readonly code: 'NOT_FOUND' | 'PROPOSAL_CLOSED' };

export async function writeMockRuleProposalAnswer(
  input: MockRuleProposalAnswer,
): Promise<MockRuleProposalResult> {
  const proposal = store.ruleProposals.findFirst((query) =>
    query.where({ proposalID: input.proposalID }),
  );

  if (proposal === undefined) {
    return { status: 'refused', code: 'NOT_FOUND' };
  }

  if (proposal.status !== 'pending' || proposal.lapseAt.getTime() <= Date.now()) {
    return { status: 'refused', code: 'PROPOSAL_CLOSED' };
  }

  await store.ruleProposals.update((query) => query.where({ proposalID: input.proposalID }), {
    data: (draft) => {
      draft.status = input.answer === 'approve' ? 'approved' : 'rejected';
      draft.reason = input.answer === 'reject' ? input.reason : null;
    },
  });

  return { status: 'answered', proposalID: input.proposalID };
}
