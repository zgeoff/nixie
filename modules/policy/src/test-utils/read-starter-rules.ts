import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRuleFiles } from '../parse-rule-files';
import type { RuleEntry } from '../types';

const starterPath = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'deploy',
  'compose',
  'definitions',
  'rules',
  'starter.yaml',
);

// The text of the starter rules file as the deployment recipe ships it.
export function readStarterRulesText(): string {
  return readFileSync(starterPath, 'utf8');
}

// The starter rules as the deployment recipe ships them, each at its first revision.
export function readStarterRules(): readonly RuleEntry[] {
  const parsed = parseRuleFiles(new Map([['rules/starter.yaml', readStarterRulesText()]]));

  if (parsed.status === 'refused') {
    throw new Error(`the starter rules do not parse: ${JSON.stringify(parsed.problems)}`);
  }

  return parsed.rules.map((entry) => ({ id: entry.rule.id, revision: 1, rule: entry.rule }));
}
