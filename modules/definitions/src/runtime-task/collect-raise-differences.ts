import { isDeepStrictEqual } from 'node:util';
import type { ParsedDefinitions } from '../types';

// The kinds of file a format applies, by the fields of the parse that hold what they read.
const kindFields = [
  { kind: 'skills', fields: ['skills', 'conversationSkills'] },
  { kind: 'prompts', fields: ['prompts'] },
  { kind: 'rules', fields: ['rules', 'ruleWarnings'] },
  { kind: 'effects', fields: ['effects'] },
  { kind: 'unapplied files', fields: ['unapplied'] },
] as const;

// Compares the same files parsed under the old format and under the new one, and names each kind
// that reads differently. Task folders are left out, because the export writes them.
export function collectRaiseDifferences(
  before: ParsedDefinitions,
  after: ParsedDefinitions,
): readonly string[] {
  return kindFields
    .filter((entry) =>
      entry.fields.some((field) => !isDeepStrictEqual(before[field], after[field])),
    )
    .map((entry) => entry.kind);
}
