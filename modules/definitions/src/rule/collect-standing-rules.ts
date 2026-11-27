import { describeCondition, renderRule } from '@heynixie/policy';
import type { RuleCondition } from '@heynixie/policy';
import type { RuleInForceEntry } from './read-rules-in-force';

export interface StandingRule {
  readonly ruleID: string;
  readonly sentence: string;
  readonly condition?: RuleCondition;
}

// The allow and ask rules that can match a conversation call outside any mandate. A rule limited to
// task definitions matches only a task run, and an expired rule matches nothing.
export function collectStandingRules(
  inForce: readonly RuleInForceEntry[],
  now: number,
): readonly StandingRule[] {
  return inForce
    .filter(
      (entry) =>
        entry.rule.rule.outcome !== 'deny' &&
        entry.rule.rule.mandate === undefined &&
        entry.rule.rule.definitions === undefined &&
        (entry.rule.rule.contexts === undefined ||
          entry.rule.rule.contexts.includes('conversation')) &&
        (entry.rule.rule.expires === undefined || Date.parse(entry.rule.rule.expires) > now),
    )
    .map((entry) => toStandingRule(entry));
}

function toStandingRule(entry: RuleInForceEntry): StandingRule {
  const condition = describeCondition(entry.rule.rule, 'you');

  return {
    ruleID: entry.rule.rule.id,
    sentence: renderRule(entry.rule.rule),
    ...(condition === undefined ? {} : { condition }),
  };
}
