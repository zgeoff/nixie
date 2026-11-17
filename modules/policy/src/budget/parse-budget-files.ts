import type { z } from 'zod';
import type { budgetPeriods } from './budget-file-schema';
import { budgetFileSchema } from './budget-file-schema';
import { toMicros } from './to-micros';

export type BudgetPeriod = (typeof budgetPeriods)[number];

// What a budget counts: all purchases, or the calls of one paid tool.
export type BudgetCounts = 'spend' | `tool:${string}`;

export interface BudgetDefinition {
  readonly id: string;
  readonly counts: BudgetCounts;
  readonly limitMicros: number;
  readonly period: BudgetPeriod;
}

export interface BudgetFileEntry {
  readonly path: string;
  readonly budget: BudgetDefinition;
}

export interface BudgetFileProblem {
  readonly path: string;
  readonly reason: string;
}

export type ParsedBudgetFiles =
  | { readonly status: 'parsed'; readonly budgets: readonly BudgetFileEntry[] }
  | { readonly status: 'refused'; readonly problems: readonly BudgetFileProblem[] };

// A budget ID belongs to one budget across every file.
export function parseBudgetFiles(files: ReadonlyMap<string, string>): ParsedBudgetFiles {
  const problems: BudgetFileProblem[] = [];

  const byID = new Map<string, BudgetFileEntry>();

  for (const [path, text] of [...files].toSorted(([left], [right]) => (left < right ? -1 : 1))) {
    const parsed = parseBudgetFile(path, text);

    if (parsed.status === 'refused') {
      problems.push(...parsed.problems);
      continue;
    }

    for (const entry of parsed.budgets) {
      const seen = byID.get(entry.budget.id);

      if (seen === undefined) {
        byID.set(entry.budget.id, entry);
      } else {
        problems.push({
          path,
          reason: `the budget ID ${entry.budget.id} is also in ${seen.path}, and an ID names one budget`,
        });
      }
    }
  }

  return problems.length > 0
    ? { status: 'refused', problems }
    : {
        status: 'parsed',
        budgets: [...byID.values()].toSorted((left, right) =>
          left.budget.id < right.budget.id ? -1 : 1,
        ),
      };
}

function parseBudgetFile(path: string, text: string): ParsedBudgetFiles {
  const yaml = parseYAML(text);

  if (yaml instanceof Error) {
    return { status: 'refused', problems: [{ path, reason: yaml.message }] };
  }

  if (yaml === null) {
    return { status: 'parsed', budgets: [] };
  }

  const result = budgetFileSchema.safeParse(yaml);

  if (!result.success) {
    return {
      status: 'refused',
      problems: result.error.issues.map((issue) => ({ path, reason: formatIssue(issue) })),
    };
  }

  return {
    status: 'parsed',
    budgets: Object.entries(result.data).map(([id, body]) => ({
      path,
      budget: {
        id,
        counts: body.counts === 'spend' ? 'spend' : `tool:${body.counts.slice('tool:'.length)}`,
        limitMicros: toMicros(body.limit),
        period: body.period,
      },
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
