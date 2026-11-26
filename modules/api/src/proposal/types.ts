export type ActionProposalAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string | null };

export type ActionProposalResult =
  | { readonly status: 'approved' | 'declined'; readonly proposalID: string }
  | {
      readonly status: 'refused';
      readonly code: 'NOT_FOUND' | 'PROPOSAL_CLOSED';
      readonly reason: string;
    };
