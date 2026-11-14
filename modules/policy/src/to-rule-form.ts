import type { JSONObject } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { Rule, RuleCheck, RuleContext, RuleForm } from './types';

export function toRuleForm(rule: Rule): RuleForm {
  return {
    id: rule.id,
    outcome: rule.outcome,
    ...(rule.tools === undefined ? {} : { tools: toSortedText(rule.tools) }),
    ...(rule.effects === undefined ? {} : { effects: toSortedSet(rule.effects) }),
    ...(rule.contexts === undefined ? {} : { contexts: toSortedSet(rule.contexts) }),
    ...(rule.definitions === undefined ? {} : { definitions: toSortedText(rule.definitions) }),
    ...(rule.checks === undefined ? {} : { checks: toSortedChecks(rule.checks) }),
    ...(rule.destinations === undefined ? {} : { destinations: toSortedText(rule.destinations) }),
    ...(rule.sources === undefined ? {} : { sources: toSortedSet(rule.sources) }),
    ...(rule.expires === undefined ? {} : { expires: new Date(rule.expires).toISOString() }),
    ...(rule.mandate === undefined ? {} : { mandate: rule.mandate }),
    ...(rule.cel === undefined ? {} : { cel: rule.cel.normalize('NFC') }),
    ...(rule.note === undefined ? {} : { note: rule.note.normalize('NFC') }),
  };
}

// The form nixie persists in this release: the names the release before reads. The release after
// this one writes the new names, and this function is the one place to change.
export function toStoredRuleForm(rule: Rule): JSONObject {
  const form = toRuleForm(rule);

  const kept = Object.entries(form).filter(
    ([field]) => field !== 'definitions' && field !== 'contexts',
  );

  return {
    ...Object.fromEntries(kept),
    ...(form.contexts === undefined
      ? {}
      : { contexts: toSortedSet(form.contexts.flatMap((context) => toStoredContexts(context))) }),
    ...(form.definitions === undefined ? {} : { jobs: form.definitions }),
  };
}

// The release before reads `task` as only a task nixie starts, so a definition's task run needs
// `job` beside it to keep matching the same calls.
function toStoredContexts(context: RuleContext): readonly string[] {
  return context === 'task' ? ['job', 'task'] : [context];
}

function toSortedText(items: readonly string[]): string[] {
  return toSortedSet(items.map((item) => item.normalize('NFC')));
}

function toSortedSet<Item extends string>(items: readonly Item[]): Item[] {
  return [...new Set(items)].toSorted();
}

function toSortedChecks(checks: readonly RuleCheck[]): RuleCheck[] {
  const unique = new Map(
    checks.map((check) => {
      const form = toCheckForm(check);

      return [JSON.stringify(form), form] as const;
    }),
  );

  return [...unique.entries()]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([, check]) => check);
}

function toCheckForm(check: RuleCheck): RuleCheck {
  return match(check)
    .with({ op: 'eq' }, (eq): RuleCheck => ({ ...eq, value: toScalarForm(eq.value) }))
    .with({ op: 'in' }, (within): RuleCheck => ({
      ...within,
      value: [
        ...new Map(
          within.value.map((value) => [JSON.stringify(toScalarForm(value)), toScalarForm(value)]),
        ).entries(),
      ]
        .toSorted(([left], [right]) => (left < right ? -1 : 1))
        .map(([, value]) => value),
    }))
    .with({ op: 'matches' }, (pattern): RuleCheck => ({
      ...pattern,
      value: pattern.value.normalize('NFC'),
    }))
    .exhaustive();
}

function toScalarForm(value: string | number | boolean): string | number | boolean {
  return typeof value === 'string' ? value.normalize('NFC') : value;
}
