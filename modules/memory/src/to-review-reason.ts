import type { ReviewReason } from './gate-types';
import { reviewReasons } from './review-reasons';

// A stored review reason as this release names it. A later release can add a reason, and a
// rollback leaves its proposals in the log and the table, so a reason this release does not know
// reads as other instead of failing the read.
export function toReviewReason(stored: string): ReviewReason {
  return reviewReasons.find((reason) => reason === stored) ?? 'other';
}
