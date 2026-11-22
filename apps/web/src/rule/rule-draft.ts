import { z } from 'zod';

export const ruleContextChoices = ['conversation', 'task', 'coding'] as const;
export const ruleSourceChoices = ['owner', 'own_data', 'task', 'outside'] as const;
export const checkOperations = ['eq', 'in', 'matches'] as const;

export interface CheckDraft {
  readonly arg: string;
  readonly op: (typeof checkOperations)[number];

  // the text of the check's value; an `in` check lists its values one to a line
  readonly value: string;

  // the check as the rule held it, so text the owner left alone keeps its type
  readonly original?: {
    readonly op: (typeof checkOperations)[number];
    readonly value: CheckValue;
  };
}

// The fields of an allow rule as the form holds them. A list field is text, one entry to a line,
// and a field the form has no input for rides along in `rest`.
export interface RuleDraft {
  readonly tools: string;
  readonly effects: string;
  readonly contexts: readonly string[];
  readonly definitions: string;
  readonly destinations: string;
  readonly sources: readonly string[];
  readonly checks: readonly CheckDraft[];
  readonly rest: Readonly<Record<string, unknown>>;
}

const listValueSchema = z.array(z.unknown());

type CheckValue = string | number | boolean | unknown[];

const checkSchema = z.object({
  arg: z.string(),
  op: z.enum(checkOperations),
  value: z.union([z.string(), z.number(), z.boolean(), listValueSchema]),
});

const stringListSchema = z.array(z.string());
const checkListSchema = z.array(checkSchema);

function collectList(value: unknown): string[] {
  const parsed = stringListSchema.safeParse(value);

  return parsed.success ? parsed.data : [];
}

function toCheckText(value: CheckValue): string {
  if (Array.isArray(value)) {
    const items = value.map(String);

    return items.join('\n');
  }

  return String(value);
}

const knownKeys = new Set([
  'outcome',
  'tools',
  'effects',
  'contexts',
  'definitions',
  'destinations',
  'sources',
  'checks',
]);

export function buildEmptyRuleDraft(): RuleDraft {
  return {
    tools: '',
    effects: '',
    contexts: [],
    definitions: '',
    destinations: '',
    sources: [],
    checks: [],
    rest: {},
  };
}

// Checks the form cannot show ride along in `rest` whole, so saving the rule never drops one.
export function toRuleDraft(rule: Readonly<Record<string, unknown>>): RuleDraft {
  const parsed = checkListSchema.safeParse(rule['checks']);
  const checks = parsed.success ? parsed.data : [];

  return {
    tools: collectList(rule['tools']).join('\n'),
    effects: collectList(rule['effects']).join('\n'),
    contexts: collectList(rule['contexts']),
    definitions: collectList(rule['definitions']).join('\n'),
    destinations: collectList(rule['destinations']).join('\n'),
    sources: collectList(rule['sources']),
    checks: checks.map((check) => ({
      arg: check.arg,
      op: check.op,
      value: toCheckText(check.value),
      original: { op: check.op, value: check.value },
    })),
    rest: Object.fromEntries(
      Object.entries(rule).filter(
        ([key]) => !knownKeys.has(key) || (key === 'checks' && !parsed.success),
      ),
    ),
  };
}

function toLines(text: string): string[] {
  return text
    .split(/[\n,]/u)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function toCheckValue(check: CheckDraft): CheckValue {
  if (
    check.original !== undefined &&
    check.original.op === check.op &&
    toCheckText(check.original.value) === check.value
  ) {
    return check.original.value;
  }

  if (check.op === 'in') {
    return toLines(check.value);
  }

  const text = check.value.trim();

  if (check.op === 'matches') {
    return text;
  }

  if (text === 'true' || text === 'false') {
    return text === 'true';
  }

  return text !== '' && Number.isFinite(Number(text)) ? Number(text) : text;
}

// The rule the host takes, always an allow rule. An empty field leaves its key out, so the host
// reads the rule as open on that field.
export function toRuleForm(draft: RuleDraft): Record<string, unknown> {
  const lists = {
    tools: toLines(draft.tools),
    effects: toLines(draft.effects),
    contexts: [...draft.contexts],
    definitions: toLines(draft.definitions),
    destinations: toLines(draft.destinations),
    sources: [...draft.sources],
  };

  const filled = Object.entries(lists).filter(([, list]) => list.length > 0);
  const kept = listValueSchema.safeParse(draft.rest['checks']);

  const checks = [
    ...(kept.success ? kept.data : []),
    ...draft.checks
      .filter((check) => check.arg.trim() !== '')
      .map((check) => ({ arg: check.arg.trim(), op: check.op, value: toCheckValue(check) })),
  ];

  return {
    ...draft.rest,
    outcome: 'allow',
    ...Object.fromEntries(filled),
    ...(checks.length === 0 ? {} : { checks }),
  };
}
