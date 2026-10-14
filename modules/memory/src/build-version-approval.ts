import type { MemoryApproval } from '@heynixie/models';
import type { ReviewReason } from './gate-types';

// The memory proposal a version came from, as its row holds it.
export interface ApprovedProposal {
  readonly operation: 'remember' | 'retire';
  readonly reason: ReviewReason;
}

// Your approval of the proposal or consolidation change a version came from, or null when it applied
// at once. Only a remember proposal held because its quote matched words you pasted, dropped or
// quoted in marks its text as a pasted page's, because a retirement's quote backs the retirement.
export function buildVersionApproval(
  proposalID: string | null,
  proposal: ApprovedProposal | null,
): MemoryApproval | null {
  if (proposalID === null) {
    return null;
  }
  return {
    isQuotePasted: proposal?.operation === 'remember' && pastedReasons.has(proposal.reason),
  };
}

const pastedReasons: ReadonlySet<ReviewReason> = new Set([
  'quote_not_typed',
  'quote_in_quoted_block',
]);
