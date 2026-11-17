import type { BudgetFileEntry } from '@heynixie/policy';
import { parseBudgetFiles } from '@heynixie/policy';
import { DefinitionsParseError } from '../utils/definitions-parse-error';

export interface BudgetDefinitions {
  readonly budgets: readonly BudgetFileEntry[];
  readonly paths: ReadonlySet<string>;
}

const budgetFilePattern = /^budgets\/.+\.ya?ml$/u;

// A prompts map can name a file under budgets/ as a prompt part, and that file holds prompt text.
export function parseBudgetDefinitions(
  texts: ReadonlyMap<string, string>,
  partFiles: ReadonlySet<string>,
): BudgetDefinitions {
  const files = new Map(
    [...texts].filter(([path]) => budgetFilePattern.test(path) && !partFiles.has(path)),
  );

  const parsed = parseBudgetFiles(files);

  if (parsed.status === 'refused') {
    throw new DefinitionsParseError(parsed.problems);
  }

  return { budgets: parsed.budgets, paths: new Set(files.keys()) };
}
