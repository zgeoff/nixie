import { buildGateReview } from './build-gate-review';
import type { ContentGateResult } from './gate-types';
import type { MemorySubject } from './types';

export function pickSubjectChangeReview(
  newSubject: MemorySubject | null,
  gate: ContentGateResult,
): ContentGateResult {
  if (gate.status !== 'pass' || newSubject === null) {
    return gate;
  }

  return buildGateReview('subject_change', {
    checks: gate.checks,
    ...(gate.evidence === null ? {} : { evidence: gate.evidence }),
  });
}
