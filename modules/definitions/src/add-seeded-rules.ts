import type { RuleInForce, SnapshotPolicy } from './types';

// Each rule enters with its revision, origin and runtime change, so a snapshot names exactly which
// revision of each rule was in force.
export function addSeededRules(
  policy: SnapshotPolicy,
  inForce: readonly RuleInForce[],
  contacts: readonly string[],
): SnapshotPolicy {
  return {
    ...policy,
    contacts,
    rules: [
      ...policy.rules,
      ...inForce.map((entry) => ({
        id: entry.ruleID,
        revision: entry.revision,
        origin: entry.origin,
        changeID: entry.changeID,
        rule: entry.rule.rule,
      })),
    ],
  };
}
