import { buildGateReview } from './build-gate-review';
import type { ContentGateResult } from './gate-types';
import type { VersionRef } from './types';

export interface SensitiveReviewWrite {
  readonly target: VersionRef | null;
  readonly isSensitive?: boolean;
}

export function pickSensitiveReview(
  write: SensitiveReviewWrite,
  gate: ContentGateResult,
): ContentGateResult {
  if (gate.status !== 'pass' || write.target !== null || write.isSensitive !== true) {
    return gate;
  }

  return buildGateReview('sensitive', {
    checks: gate.checks,
    ...(gate.evidence === null ? {} : { evidence: gate.evidence }),
  });
}
