import { renderRule } from '@heynixie/policy';
import type { RuleInForceEntry } from './read-rules-in-force';

export interface StandingRule {
  readonly ruleID: string;
  readonly sentence: string;
}

// The allow and ask rules that can match a conversation call outside any mandate. A rule limited to
// task definitions matches only a task run, and an expired rule matches nothing.
export function collectStandingRules(
  inForce: readonly RuleInForceEntry[],
  now: number,
): readonly StandingRule[] {
  return inForce
    .map((entry) => entry.rule.rule)
    .filter(
      (rule) =>
        rule.outcome !== 'deny' &&
        rule.mandate === undefined &&
        rule.definitions === undefined &&
        (rule.contexts === undefined || rule.contexts.includes('conversation')) &&
        (rule.expires === undefined || Date.parse(rule.expires) > now),
    )
    .map((rule) => ({ ruleID: rule.id, sentence: renderRule(rule) }));
}
