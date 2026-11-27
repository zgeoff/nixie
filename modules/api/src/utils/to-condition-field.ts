import type { RuleCondition } from '@heynixie/policy';

// The `condition` field of a rule's schema, left out for a rule with no condition.
export function toConditionField(condition: RuleCondition | undefined): {
  readonly condition?: RuleCondition;
} {
  return condition === undefined ? {} : { condition };
}
