import { RE2JS } from 're2js';
import { z } from 'zod';
import type { FilterClause, Rule } from '../types';
import { parseFilter } from './parse-filter';

const componentSchema = z.object({ id: z.string(), optional: z.boolean().optional() });

const ruleSchema = z.object({
  id: z.string(),
  regex: z.string().optional(),
  path: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  secretGroup: z.number().optional(),
  filter: z.string().optional(),
  skipReport: z.boolean().optional(),
  components: z.array(componentSchema).optional(),
});

const sourceSchema = z.object({
  filter: z.string().optional(),
  rules: z.array(ruleSchema),
});

export interface ParsedRuleSource {
  rules: Rule[];
  filter: FilterClause[];

  // the rules that never fire, each with the reason
  leftOut: { ruleID: string; reason: string }[];

  // the filter clauses the scan cannot evaluate; the rule is 'all rules' for the top-level filter
  dropped: { ruleID: string; clause: string }[];
}

// Reads the upstream rule file into the rules the scan runs. It leaves out a rule with no regex and
// a rule that matches a file path, because a URL has no file path to match. It copies no `validate`
// script, because one sends the secret over HTTP.
export function parseRuleSource(sourceText: string): ParsedRuleSource {
  const source = sourceSchema.parse(Bun.TOML.parse(sourceText));
  const topLevel = parseFilter('all rules', source.filter ?? '');

  const parsed: ParsedRuleSource = {
    rules: [],
    filter: topLevel.clauses,
    leftOut: [],
    dropped: topLevel.dropped.map((clause) => ({ ruleID: 'all rules', clause })),
  };

  assertPatternsCompile('all rules', undefined, topLevel.clauses);

  for (const rule of source.rules) {
    if (rule.regex === undefined) {
      parsed.leftOut.push({ ruleID: rule.id, reason: 'it has no regex' });
    } else if (rule.path === undefined) {
      const filter = parseFilter(rule.id, rule.filter ?? '');

      assertPatternsCompile(rule.id, rule.regex, filter.clauses);

      parsed.dropped.push(...filter.dropped.map((clause) => ({ ruleID: rule.id, clause })));
      parsed.rules.push(buildRule(rule, rule.regex, filter.clauses));
    } else {
      parsed.leftOut.push({ ruleID: rule.id, reason: 'it matches a file path' });
    }
  }

  return parsed;
}

function assertPatternsCompile(
  ruleID: string,
  regex: string | undefined,
  clauses: readonly FilterClause[],
): void {
  const regexes = regex === undefined ? [] : [regex];

  for (const pattern of [...regexes, ...collectPatterns(clauses)]) {
    try {
      RE2JS.compile(pattern);
    } catch (error) {
      throw new Error(`rule ${ruleID}: a pattern does not compile on re2js: ${pattern}`, {
        cause: error,
      });
    }
  }
}

function collectPatterns(clauses: readonly FilterClause[]): string[] {
  return clauses.flatMap((clause) => {
    if (clause.kind === 'all' || clause.kind === 'any') {
      return collectPatterns(clause.clauses);
    }

    return clause.kind === 'matches' ? [...clause.patterns] : [];
  });
}

type SourceRule = z.infer<typeof ruleSchema>;

function buildRule(rule: SourceRule, regex: string, filter: readonly FilterClause[]): Rule {
  const keywords = (rule.keywords ?? []).map((keyword) => keyword.toLowerCase());

  const required = (rule.components ?? [])
    .filter((component) => component.optional !== true)
    .map((component) => component.id);

  return {
    id: rule.id,
    regex,
    ...(keywords.length > 0 && { keywords }),
    ...(rule.secretGroup !== undefined && { secretGroup: rule.secretGroup }),
    ...(filter.length > 0 && { filter }),
    ...(required.length > 0 && { components: required }),
    ...(rule.skipReport === true && { skipReport: true as const }),
  };
}
