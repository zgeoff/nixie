import { parseRuleSource } from '../rule-build/parse-rule-source';
import { makeRuleScanner } from '../scan/make-rule-scanner';
import type { SecretMatch } from '../types';

// Scans a text with the rules of an invented rule file.
export function scanRuleSource(sourceText: string, text: string): SecretMatch | null {
  const parsed = parseRuleSource(sourceText);

  return makeRuleScanner(parsed.rules, parsed.filter)([text]);
}
