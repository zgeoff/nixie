import { buildGateReview } from './build-gate-review';
import type { ContentGateResult } from './gate-types';
import type { MemorySubject } from './types';

export function pickSubjectChangeReview(
  newSubject: MemorySubject | null,
  gate: ContentGateResult,
): ContentGateResult {
  if (newSubject === null || !isPassingGate(gate)) {
    return gate;
  }

  return buildGateReview('subject_change', {
    checks: gate.checks,
    ...(gate.evidence === null ? {} : { evidence: gate.evidence }),
  });
}

function isPassingGate(gate: ContentGateResult): boolean {
  if (gate.status === 'pass') {
    return true;
  }

  return gate.reason === 'self_note' && gate.checks['tokens'] !== 'fail';
}
