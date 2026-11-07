import type { z } from 'zod';
import { rulesFileSchema } from './rules-file-schema';
import { toRuleForm } from './to-rule-form';
import type { RuleForm } from './types';

export interface RuleFileEntry {
  readonly path: string;
  readonly rule: RuleForm;
}

export interface RuleFileProblem {
  readonly path: string;
  readonly reason: string;
}

export type ParsedRuleFiles =
  | { readonly status: 'parsed'; readonly rules: readonly RuleFileEntry[] }
  | { readonly status: 'refused'; readonly problems: readonly RuleFileProblem[] };

export function parseRuleFiles(files: ReadonlyMap<string, string>): ParsedRuleFiles {
  const problems: RuleFileProblem[] = [];

  const byID = new Map<string, RuleFileEntry>();

  for (const [path, text] of [...files].toSorted(([left], [right]) => (left < right ? -1 : 1))) {
    const parsed = parseRuleFile(path, text);

    if (parsed.status === 'refused') {
      problems.push(...parsed.problems);
      continue;
    }

    for (const entry of parsed.rules) {
      const seen = byID.get(entry.rule.id);

      if (seen === undefined) {
        byID.set(entry.rule.id, entry);
      } else {
        problems.push({
          path,
          reason: `the rule ID ${entry.rule.id} is also in ${seen.path}, and an ID names one rule`,
        });
      }
    }
  }

  return problems.length > 0
    ? { status: 'refused', problems }
    : {
        status: 'parsed',
        rules: [...byID.values()].toSorted((left, right) =>
          left.rule.id < right.rule.id ? -1 : 1,
        ),
      };
}

function parseRuleFile(path: string, text: string): ParsedRuleFiles {
  const yaml = parseYAML(text);

  if (yaml instanceof Error) {
    return { status: 'refused', problems: [{ path, reason: yaml.message }] };
  }

  if (yaml === null) {
    return { status: 'parsed', rules: [] };
  }

  const result = rulesFileSchema.safeParse(yaml);

  if (!result.success) {
    return {
      status: 'refused',
      problems: result.error.issues.map((issue) => ({ path, reason: formatIssue(issue) })),
    };
  }

  return {
    status: 'parsed',
    rules: Object.entries(result.data).map(([id, body]) => ({
      path,
      rule: toRuleForm({ id, ...body }),
    })),
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
