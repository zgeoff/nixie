import type { Rule, RuleCondition } from '@heynixie/policy';
import { describeCondition } from '@heynixie/policy';

// The card's conditions: one entry for each rule that holds one, with its place among the rules.
export function toConditionFields(
  rules: readonly Pick<Rule, 'cel' | 'note'>[],
  noteBy: RuleCondition['noteBy'],
): { readonly ruleConditions?: (RuleCondition & { readonly rule: number })[] } {
  const conditions = rules.flatMap((rule, index) => {
    const condition = describeCondition(rule, noteBy);

    return condition === undefined ? [] : [{ ...condition, rule: index }];
  });

  return conditions.length === 0 ? {} : { ruleConditions: conditions };
}
