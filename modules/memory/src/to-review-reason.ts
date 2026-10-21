import type { ReviewReason } from './gate-types';
import { reviewReasons } from './review-reasons';

export function toReviewReason(stored: string): ReviewReason {
  return reviewReasons.find((reason) => reason === stored) ?? 'other';
}
