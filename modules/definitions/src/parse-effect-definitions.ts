import type { EffectOverride } from '@heynixie/policy';
import { parseEffectOverrides } from '@heynixie/policy';
import { DefinitionsParseError } from './definitions-parse-error';

export interface EffectDefinitions {
  readonly effects: ReadonlyMap<string, EffectOverride>;
  readonly paths: ReadonlySet<string>;
}

const effectFilePattern = /^effects\/.+\.ya?ml$/u;

export function parseEffectDefinitions(
  texts: ReadonlyMap<string, string>,
  partFiles: ReadonlySet<string>,
): EffectDefinitions {
  const files = new Map(
    [...texts].filter(([path]) => effectFilePattern.test(path) && !partFiles.has(path)),
  );

  const parsed = parseEffectOverrides(files);

  if (parsed.status === 'refused') {
    throw new DefinitionsParseError(parsed.problems);
  }

  return { effects: parsed.overrides, paths: new Set(files.keys()) };
}
