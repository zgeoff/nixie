import { parseRuleSource } from './parse-rule-source';
import { pinnedSource } from './pinned-source';

const ruleFileBuildCommand = 'bun run --cwd libs/secret-scan rules:build';

// Builds the text of the generated rule file from the upstream rule file and its licence. The same
// input always gives the same text.
export function buildRuleFile(sourceText: string, licenseText: string): string {
  const parsed = parseRuleSource(sourceText);

  const header = [
    'Generated. Do not edit.',
    `Regenerate it with: ${ruleFileBuildCommand}`,
    '',
    `Source: github.com/${pinnedSource.repository}, tag ${pinnedSource.tag}`,
    `Commit: ${pinnedSource.commit}`,
    `File: ${pinnedSource.rulesPath}`,
    `SHA-256: ${pinnedSource.rulesSha256}`,
    '',
    'The licence of the source:',
    '',
    ...licenseText.trimEnd().split('\n'),
    '',
    'The rules that never fire, because a URL has no file to match:',
    ...parsed.leftOut.map((entry) => `  ${entry.ruleID}: ${entry.reason}`),
    '',
    'The filter clauses left out, because each reads more than the secret or the match.',
    'A clause left out never discards a finding:',
    ...parsed.dropped.map((entry) => `  ${entry.ruleID}: ${entry.clause}`),
  ];

  return [
    ...header.map((line) => (line === '' ? '//' : `// ${line}`)),
    '',
    "import type { FilterClause, Rule } from '../types';",
    '',
    `export const publicFilter = ${JSON.stringify(parsed.filter, null, 2)} satisfies readonly FilterClause[];`,
    '',
    `export const publicRules = ${JSON.stringify(parsed.rules, null, 2)} satisfies readonly Rule[];`,
    '',
  ].join('\n');
}
