import type { MemoryApproval } from '@heynixie/models';
import type { ReviewReason } from './gate-types';

// Your approval of the proposal or consolidation change a version came from, or null when it applied
// at once. A proposal held because its quote matched words you pasted, dropped or quoted in rather
// than typed marks its text as a pasted page's; a consolidation change has no review reason.
export function buildVersionApproval(
  proposalID: string | null,
  reviewReason: ReviewReason | null,
): MemoryApproval | null {
  if (proposalID === null) {
    return null;
  }
  return { isQuotePasted: reviewReason !== null && pastedReasons.has(reviewReason) };
}

const pastedReasons: ReadonlySet<ReviewReason> = new Set([
  'quote_not_typed',
  'quote_in_quoted_block',
]);
