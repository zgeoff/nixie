import type { Rule } from '@heynixie/policy';

// An allow rule with a lift lets a purchase through within a budget, which the always-ask set
// otherwise asks about.
export function isLiftingRule(rule: Pick<Rule, 'outcome' | 'lift'>): boolean {
  return rule.outcome === 'allow' && rule.lift !== undefined;
}
