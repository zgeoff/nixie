import type { Rule, RuleEntry } from '../types';

export function buildRuleEntry(id: string, rule: Omit<Rule, 'id'>): RuleEntry {
  return { id, revision: 2, rule: { id, ...rule } };
}
