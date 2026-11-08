import type { RuleFileEntry } from '@heynixie/policy';
import { buildRuleHash } from './build-rule-hash';
import type { DefinitionRule } from './types';

export function buildDefinitionRule(entry: RuleFileEntry): DefinitionRule {
  return { hash: buildRuleHash(entry.rule), rule: entry.rule, path: entry.path };
}
