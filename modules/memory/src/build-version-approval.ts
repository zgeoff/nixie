import type { MemoryApproval } from '@heynixie/sessions';
import type { ReviewReason } from './gate-types';

// The memory proposal a version came from, as its row holds it.
export interface ApprovedProposal {
  readonly operation: 'remember' | 'retire';
  readonly reason: ReviewReason;
}

// Your approval of the proposal or consolidation change a version came from, or null when it applied
// at once. Only a remember proposal whose quote sat in a quoted block of your message marks its text
// as a pasted page's; a quote that was not typed may come from a reply or a tool result.
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
