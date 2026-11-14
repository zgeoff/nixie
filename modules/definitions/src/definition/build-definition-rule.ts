import type { RuleFileEntry } from '@heynixie/policy';
import type { DefinitionRule } from '../types';
import { buildRuleHash } from '../utils/build-rule-hash';

export function buildDefinitionRule(entry: RuleFileEntry): DefinitionRule {
  return { hash: buildRuleHash(entry.rule), rule: entry.rule, path: entry.path };
}
