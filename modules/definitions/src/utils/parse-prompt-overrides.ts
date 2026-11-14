import type { PromptOverride, PromptOverrides } from '@heynixie/prompts';
import { checkPromptOverride, promptIDs } from '@heynixie/prompts';
import invariant from 'tiny-invariant';
import type { z } from 'zod';
import type { ParseProblem } from './definitions-parse-error';
import { DefinitionsParseError } from './definitions-parse-error';
import { manifestPath } from './manifest-path';
import type { manifestPromptsSchema } from './manifest-prompts-schema';

export type ManifestPrompts = z.output<typeof manifestPromptsSchema>;

export interface ParsedPromptOverrides {
  readonly prompts: PromptOverrides;
  readonly partFiles: ReadonlySet<string>;
}

export function parsePromptOverrides(
  manifest: ManifestPrompts | undefined,
  texts: ReadonlyMap<string, string>,
): ParsedPromptOverrides {
  const problems: ParseProblem[] = [];

  const partFiles = new Set<string>();

  const prompts: Record<string, PromptOverride> = {};

  for (const id of promptIDs) {
    const entries = Object.entries(manifest?.[id] ?? {});
    const parts: Record<string, string> = {};

    const partPaths = new Map<string, string>();

    let template: string | null = null;

    for (const [key, value] of entries) {
      if (value === undefined) {
        continue;
      }

      if (key === '_template') {
        template = trimLineBreaks(value);
        continue;
      }

      const text = texts.get(value);

      if (text === undefined) {
        problems.push({
          path: manifestPath,
          reason: `prompts.${id}.${key}: the definitions hold no file ${value}`,
        });

        continue;
      }

      parts[key] = trimLineBreaks(text);

      partPaths.set(key, value);
      partFiles.add(value);
    }

    if (Object.keys(parts).length === 0 && template === null) {
      continue;
    }

    const override = { parts, template };

    for (const problem of checkPromptOverride(id, override)) {
      const path = problem.part === null ? manifestPath : partPaths.get(problem.part);

      invariant(path !== undefined, `the ${id} prompt has no file for its ${problem.part} part`);

      problems.push({ path, reason: problem.reason });
    }

    prompts[id] = override;
  }

  if (problems.length > 0) {
    throw new DefinitionsParseError(problems);
  }

  return { prompts, partFiles };
}

// An editor ends a file, and a YAML block scalar ends its text, with a line break that the
// prompt's own layout never wants.
function trimLineBreaks(text: string): string {
  return text.replace(/(?:\r\n|\r|\n)+$/u, '');
}
