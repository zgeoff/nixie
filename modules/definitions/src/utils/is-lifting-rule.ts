import type { Rule } from '@heynixie/policy';
import { alwaysAskEffects } from '@heynixie/policy';

// An allow rule that names an effect of the always-ask set lets such a call through.
export function isLiftingRule(rule: Pick<Rule, 'outcome' | 'effects'>): boolean {
  return (
    rule.outcome === 'allow' && (rule.effects ?? []).some((effect) => alwaysAskEffects.has(effect))
  );
}
