import type { CheckerAnswer } from '@heynixie/sessions';
import type { ReviewReason } from './gate-context';

export function pickCheckerReviewReason(answer: CheckerAnswer): ReviewReason {
  if (answer.failure === 'timeout' || answer.failure === 'error') {
    return 'checker_unreachable';
  }

  return answer.verdict === 'unsure' ? 'checker_unsure' : 'checker_not_asserted';
}
