import { reviewReasons } from '../utils/review-reasons';
import type { ReviewReason } from './gate-context';

export function toReviewReason(stored: string): ReviewReason {
  return reviewReasons.find((reason) => reason === stored) ?? 'other';
}
