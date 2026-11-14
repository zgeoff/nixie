import type { z } from 'zod';
import type { RuleForm } from '../types';
import { ruleFieldNames } from './rules-file-body-schema';
import { rulesFileSchema } from './rules-file-schema';
import { toRuleForm } from './to-rule-form';

export interface RuleFileEntry {
  readonly path: string;
  readonly rule: RuleForm;
}

export interface RuleFileProblem {
  readonly path: string;
  readonly reason: string;
}

// A field this release does not know. An allow rule that holds one is skipped whole, so it matches
// nothing; an ask or deny rule drops the field and keeps the rest, so it matches more.
export interface RuleFileWarning {
  readonly path: string;
  readonly ruleID: string;
  readonly field: string;
  readonly action: 'skipped' | 'dropped';
}

export type ParsedRuleFiles =
  | {
      readonly status: 'parsed';
      readonly rules: readonly RuleFileEntry[];
      readonly warnings: readonly RuleFileWarning[];
    }
  | { readonly status: 'refused'; readonly problems: readonly RuleFileProblem[] };

export function parseRuleFiles(files: ReadonlyMap<string, string>): ParsedRuleFiles {
  const problems: RuleFileProblem[] = [];
  const warnings: RuleFileWarning[] = [];

  const byID = new Map<string, RuleFileEntry>();

  for (const [path, text] of [...files].toSorted(([left], [right]) => (left < right ? -1 : 1))) {
    const parsed = parseRuleFile(path, text);

    if (parsed.status === 'refused') {
      problems.push(...parsed.problems);
      continue;
    }

    warnings.push(...parsed.warnings);

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
        warnings,
      };
}

function parseRuleFile(path: string, text: string): ParsedRuleFiles {
  const yaml = parseYAML(text);

  if (yaml instanceof Error) {
    return { status: 'refused', problems: [{ path, reason: yaml.message }] };
  }

  if (yaml === null) {
    return { status: 'parsed', rules: [], warnings: [] };
  }

  const stripped = stripUnknownFields(path, yaml);
  const result = rulesFileSchema.safeParse(stripped.yaml);

  if (!result.success) {
    return {
      status: 'refused',
      problems: result.error.issues.map((issue) => ({ path, reason: formatIssue(issue) })),
    };
  }

  return {
    status: 'parsed',
    rules: Object.entries(result.data)
      .filter(([id]) => !stripped.skippedIDs.has(id))
      .map(([id, body]) => ({ path, rule: toRuleForm({ id, ...body }) })),
    warnings: stripped.warnings,
  };
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

// A field nested inside a checks entry is not stripped, so the schema still refuses it. A skipped
// allow rule keeps its known fields in the YAML, so the schema validates it before the caller
// leaves it out of the rules.
function stripUnknownFields(
  path: string,
  yaml: unknown,
): {
  readonly yaml: unknown;
  readonly warnings: readonly RuleFileWarning[];
  readonly skippedIDs: ReadonlySet<string>;
} {
  if (!isRecord(yaml)) {
    return { yaml, warnings: [], skippedIDs: new Set() };
  }

  const skippedIDs = new Set<string>();

  const warnings: RuleFileWarning[] = [];
  const kept: Record<string, unknown> = {};

  for (const [ruleID, body] of Object.entries(yaml)) {
    const unknown = isRecord(body)
      ? Object.keys(body).filter((field) => !ruleFieldNames.has(field))
      : [];

    if (!isRecord(body) || unknown.length === 0) {
      kept[ruleID] = body;
      continue;
    }

    const action = body['outcome'] === 'allow' ? 'skipped' : 'dropped';

    warnings.push(...unknown.map((field) => ({ path, ruleID, field, action }) as const));

    kept[ruleID] = Object.fromEntries(
      Object.entries(body).filter(([field]) => ruleFieldNames.has(field)),
    );

    if (action === 'skipped') {
      skippedIDs.add(ruleID);
    }
  }

  return { yaml: kept, warnings, skippedIDs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const at = issue.path.map(String).join('.');

  return at.length === 0 ? issue.message : `${at}: ${issue.message}`;
}
