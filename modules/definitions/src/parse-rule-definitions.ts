import type { RuleFileEntry } from '@heynixie/policy';
import { parseRuleFiles } from '@heynixie/policy';
import { DefinitionsParseError } from './definitions-parse-error';

export interface RuleDefinitions {
  readonly rules: readonly RuleFileEntry[];
  readonly paths: ReadonlySet<string>;
}

const ruleFilePattern = /^rules\/.+\.ya?ml$/u;

// A prompts map can name a file under rules/ as a prompt part, and that file holds prompt text.
export function parseRuleDefinitions(
  texts: ReadonlyMap<string, string>,
  partFiles: ReadonlySet<string>,
): RuleDefinitions {
  const files = new Map(
    [...texts].filter(([path]) => ruleFilePattern.test(path) && !partFiles.has(path)),
  );

  const parsed = parseRuleFiles(files);

  if (parsed.status === 'refused') {
    throw new DefinitionsParseError(parsed.problems);
  }

  return { rules: parsed.rules, paths: new Set(files.keys()) };
}
