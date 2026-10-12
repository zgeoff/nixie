import type { JSONObject } from '@heynixie/log';
import type { ContentGateResult, ReviewReason } from './gate-types';
import type { QuoteEvidence } from './types';

export interface GateReviewDetail {
  readonly checks: JSONObject;
  readonly evidence?: QuoteEvidence;
  readonly checkerReason?: string;
}

// A gate outcome that sends the write to review with its reason and the checks that ran.
export function buildGateReview(reason: ReviewReason, detail: GateReviewDetail): ContentGateResult {
  return {
    status: 'review',
    reason,
    evidence: detail.evidence ?? null,
    checks: detail.checks,
    checkerReason: detail.checkerReason ?? null,
  };
}
