import { isDeepStrictEqual } from 'node:util';
import type { ParsedDefinitions } from '../types';

// A raise must not apply a file nobody reviewed, such as an effects file that changes which rules
// match, so each file the old format left unapplied and the new one applies blocks it.
export function collectRaiseBlockers(
  before: ParsedDefinitions,
  after: ParsedDefinitions,
): readonly string[] {
  const stillUnapplied = new Set(after.unapplied);

  const files = before.unapplied.filter((path) => !stillUnapplied.has(path));
  const isPromptsMapApplied = !isDeepStrictEqual(before.prompts, after.prompts);

  return [...(isPromptsMapApplied ? ['the `prompts:` map in nixie.yaml'] : []), ...files];
}
