import type { RuleNeed } from '@heynixie/policy';
import { isNeedMet } from '@heynixie/policy';
import type { MemoryWriteVerdict } from '@heynixie/tools';

export interface CoveringRule {
  readonly id: string;
  readonly revision: number;
}

// The first allow rule that matched the call and holds the check the write needs, or null when the
// write has no allow rule or no rule holds the check.
export function pickCoveringRule(
  verdict: MemoryWriteVerdict | undefined,
  need: RuleNeed,
): CoveringRule | null {
  if (verdict?.kind !== 'rule-allow') {
    return null;
  }

  const covering = verdict.rules.find((rule) => isNeedMet(rule, need));

  return covering === undefined ? null : { id: covering.id, revision: covering.revision };
}
