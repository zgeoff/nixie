import type { Rule } from '@heynixie/policy';
import { checkCondition } from '@heynixie/policy';

// One fault for each rule whose condition fails the check, named by the rule's place, from 1.
export function collectConditionFaults(
  rules: readonly Pick<Rule, 'cel' | 'note'>[],
): readonly string[] {
  return rules.flatMap((rule, index) => {
    if (rule.cel === undefined) {
      return [];
    }

    const checked = checkCondition({ cel: rule.cel, note: rule.note });

    return checked.ok ? [] : [`rules.${index + 1}.cel: ${checked.fault}: ${checked.detail}`];
  });
}
