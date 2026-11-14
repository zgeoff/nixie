import { buildGateReview } from './build-gate-review';
import type { ContentGateResult } from './gate-context';

export interface AskingRule {
  readonly id: string;
  readonly revision: number;
}

// An ask rule on memory_write sends the write to the owner's review.
export function buildAskReview(rule: AskingRule): ContentGateResult {
  return buildGateReview('ask_rule', {
    checks: { rule: { id: rule.id, revision: rule.revision } },
  });
}
