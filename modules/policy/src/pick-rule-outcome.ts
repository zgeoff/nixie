import { isRuleMatch } from './is-rule-match';
import type { Rule, RuleCall, RuleOutcome } from './types';

export interface RuleVerdict {
  readonly outcome: RuleOutcome;
  readonly ruleID: string;
  readonly others: readonly string[];
}

const strictestFirst: readonly RuleOutcome[] = ['deny', 'ask', 'allow'];

export function pickRuleOutcome(rules: readonly Rule[], call: RuleCall): RuleVerdict | null {
  const matched = rules.filter((rule) => isRuleMatch(rule, call));

  for (const outcome of strictestFirst) {
    const [ruleID, ...others] = matched
      .filter((rule) => rule.outcome === outcome)
      .map((rule) => rule.id)
      .toSorted();

    if (ruleID !== undefined) {
      return { outcome, ruleID, others };
    }
  }

  return null;
}
