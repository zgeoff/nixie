import type { MemoryApproval } from '@heynixie/sessions';
import type { ReviewReason } from './gate-types';

export interface ApprovedProposal {
  readonly operation: 'remember' | 'retire';
  readonly reason: ReviewReason;
}

export function buildVersionApproval(
  proposalID: string | null,
  proposal: ApprovedProposal | null,
): MemoryApproval | null {
  if (proposalID === null) {
    return null;
  }

  return {
    isQuotePasted:
      proposal?.operation === 'remember' && proposal.reason === 'quote_in_quoted_block',
  };
}
