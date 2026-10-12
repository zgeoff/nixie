import type { CheckerAnswer } from '@heynixie/models';
import type { ReviewReason } from './gate-types';

// The review reason for a checker answer that is not asserted. A timeout or an error means the
// checker could not be reached, and an unreadable answer counts as unsure.
export function pickCheckerReviewReason(answer: CheckerAnswer): ReviewReason {
  if (answer.failure === 'timeout' || answer.failure === 'error') {
    return 'checker_unreachable';
  }
  return answer.verdict === 'unsure' ? 'checker_unsure' : 'checker_not_asserted';
}
