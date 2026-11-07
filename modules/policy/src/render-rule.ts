import { match } from 'ts-pattern';
import type { Rule, RuleCheck, RuleContext, RuleSource } from './types';

export function renderRule(rule: Rule): string {
  const isAllow = rule.outcome === 'allow';

  const lead = match(rule.outcome)
    .with('allow', () => '**Allow**')
    .with('ask', () => '**Ask** before')
    .with('deny', () => '**Deny**')
    .exhaustive();

  const subject =
    rule.tools === undefined ? 'a call' : joinOr(rule.tools.map((tool) => renderCode(tool)));

  const conditions = [
    ...(rule.effects === undefined ? [] : [renderEffects(rule.effects, isAllow)]),
    ...(rule.contexts === undefined ? [] : [renderContexts(rule.contexts)]),
    ...(rule.jobs === undefined
      ? []
      : [`it runs in the job ${joinOr(rule.jobs.map((job) => renderCode(job)))}`]),
    ...(rule.checks ?? []).map((check) => renderCheck(check)),
    ...(rule.destinations === undefined ? [] : [renderDestinations(rule.destinations, isAllow)]),
    ...(rule.sources === undefined ? [] : [renderSources(rule.sources, isAllow)]),
    ...(rule.cel === undefined ? [] : [`the CEL condition ${renderCode(rule.cel)} holds`]),
  ];

  const when = conditions.length === 0 ? '' : ` when ${joinAnd(conditions)}`;
  const until = rule.expires === undefined ? '' : `, until ${rule.expires}`;

  return `${lead} ${subject}${when}${until}.`;
}

function joinOr(items: readonly string[]): string {
  return joinList(items, 'or');
}

function joinList(items: readonly string[], word: string): string {
  const last = items.at(-1) ?? '';

  return items.length <= 1 ? last : `${items.slice(0, -1).join(', ')} ${word} ${last}`;
}

function renderCode(text: string): string {
  return `\`${text}\``;
}

function renderEffects(effects: readonly string[], isAllow: boolean): string {
  const listed = joinOr(effects.map((effect) => renderCode(effect)));

  return isAllow ? `every effect it has is ${listed}` : `it has the effect ${listed}`;
}

const contextNames: Readonly<Record<RuleContext, string>> = {
  conversation: 'a conversation',
  task: 'a task',
  job: 'a job',
  coding: 'a coding session',
};

function renderContexts(contexts: readonly RuleContext[]): string {
  return `it runs in ${joinOr(contexts.map((context) => contextNames[context]))}`;
}

function renderCheck(check: RuleCheck): string {
  const arg = renderCode(check.arg);

  return match(check)
    .with({ op: 'eq' }, (eq) => `${arg} is ${renderCode(String(eq.value))}`)
    .with(
      { op: 'in' },
      (within) => `${arg} is ${joinOr(within.value.map((value) => renderCode(String(value))))}`,
    )
    .with({ op: 'matches' }, (pattern) => `${arg} matches ${renderCode(pattern.value)}`)
    .exhaustive();
}

function renderDestinations(destinations: readonly string[], isAllow: boolean): string {
  const listed = joinOr(destinations.map((destination) => renderCode(destination)));

  return isAllow ? `every destination matches ${listed}` : `a destination matches ${listed}`;
}

const sourceNames: Readonly<Record<RuleSource, string>> = {
  owner: 'you',
  own_data: 'your own data',
  task: 'a task',
  outside: 'outside',
};

function renderSources(sources: readonly RuleSource[], isAllow: boolean): string {
  const listed = joinOr(sources.map((source) => sourceNames[source]));

  return isAllow
    ? `its content comes only from ${listed}`
    : `any of its content comes from ${listed}`;
}

function joinAnd(items: readonly string[]): string {
  return joinList(items, 'and');
}
