import type { PlannedRule } from './build-rule-seed-plan';
import type { SnapshotPolicy } from './types';

export function addSeededRules(
  policy: SnapshotPolicy,
  inForce: readonly PlannedRule[],
): SnapshotPolicy {
  return { ...policy, rules: [...policy.rules, ...inForce.map((entry) => entry.rule.rule)] };
}
