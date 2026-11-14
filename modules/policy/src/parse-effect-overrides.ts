import type { z } from 'zod';
import { effectOverridesFileSchema } from './effect-overrides-file-schema';
import type { EffectOverride } from './types';

export interface EffectOverrideProblem {
  readonly path: string;
  readonly reason: string;
}

export type ParsedEffectOverrides =
  | { readonly status: 'parsed'; readonly overrides: ReadonlyMap<string, EffectOverride> }
  | { readonly status: 'refused'; readonly problems: readonly EffectOverrideProblem[] };

// A tool may appear in one file only, so an override has one source.
export function parseEffectOverrides(files: ReadonlyMap<string, string>): ParsedEffectOverrides {
  const problems: EffectOverrideProblem[] = [];

  const overrides = new Map<string, EffectOverride>();
  const sources = new Map<string, string>();

  for (const [path, text] of [...files].toSorted(([left], [right]) => (left < right ? -1 : 1))) {
    const parsed = parseEffectOverrideFile(path, text);

    if (parsed.status === 'refused') {
      problems.push(...parsed.problems);
      continue;
    }

    for (const [tool, override] of parsed.overrides) {
      const seen = sources.get(tool);

      if (seen === undefined) {
        sources.set(tool, path);
        overrides.set(tool, override);
      } else {
        problems.push({
          path,
          reason: `the tool ${tool} is also in ${seen}, and a tool has one override`,
        });
      }
    }
  }

  return problems.length > 0 ? { status: 'refused', problems } : { status: 'parsed', overrides };
}

function parseEffectOverrideFile(path: string, text: string): ParsedEffectOverrides {
  const yaml = parseYAML(text);

  if (yaml instanceof Error) {
    return { status: 'refused', problems: [{ path, reason: yaml.message }] };
  }

  if (yaml === null) {
    return { status: 'parsed', overrides: new Map() };
  }

  const result = effectOverridesFileSchema.safeParse(yaml);

  if (!result.success) {
    return {
      status: 'refused',
      problems: result.error.issues.map((issue) => ({ path, reason: formatIssue(issue) })),
    };
  }

  return {
    status: 'parsed',
    overrides: new Map(
      Object.entries(result.data).map(([tool, override]) => [
        tool,
        { add: override.add.toSorted(), remove: override.remove.toSorted() },
      ]),
    ),
  };
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const at = issue.path.map(String).join('.');

  return at.length === 0 ? issue.message : `${at}: ${issue.message}`;
}
