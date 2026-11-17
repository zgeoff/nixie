import type { Rule } from '@heynixie/policy';
import { alwaysAskEffects } from '@heynixie/policy';

// An allow rule that names an effect of the always-ask set, or carries a lift, lets such a call
// through.
export function isLiftingRule(rule: Pick<Rule, 'outcome' | 'effects' | 'lift'>): boolean {
  return (
    rule.outcome === 'allow' &&
    (rule.lift !== undefined || (rule.effects ?? []).some((effect) => alwaysAskEffects.has(effect)))
  );
}
