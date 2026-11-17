import type { JSONObject } from '@heynixie/log';
import { normalizeInstructions } from '../definition/normalize-instructions';
import { buildSHA256 } from '../utils/build-sha256';
import { toCanonicalJSON } from '../utils/to-canonical-json';

export interface DefinitionHashParts {
  readonly id: string;
  readonly form: JSONObject;

  // the text of instructions.md, or undefined when the folder has none
  readonly instructions: string | undefined;

  // the text of the step file, or undefined when the definition names none
  readonly step: string | undefined;
}

export function buildDefinitionHash(parts: DefinitionHashParts): string {
  const instructions =
    parts.instructions === undefined
      ? null
      : buildSHA256(normalizeInstructions(parts.instructions));

  const step = parts.step === undefined ? null : buildSHA256(parts.step);
  const canonical = toCanonicalJSON({ id: parts.id, form: parts.form, instructions, step });

  return buildSHA256(canonical);
}
