import { match } from 'ts-pattern';
import { isPatternMatch } from './is-pattern-match';
import type { Rule, RuleCall, RuleCheck } from './types';

export function isRuleMatch(rule: Rule, call: RuleCall): boolean {
  const isAllow = rule.outcome === 'allow';

  if (rule.cel !== undefined && isAllow) {
    return false;
  }

  return (
    (rule.expires === undefined || call.at < Date.parse(rule.expires)) &&
    (rule.tools === undefined || rule.tools.some((pattern) => isToolMatch(pattern, call.tool))) &&
    (rule.contexts === undefined || rule.contexts.includes(call.context)) &&
    (rule.jobs === undefined || (call.job !== null && rule.jobs.includes(call.job))) &&
    (rule.effects === undefined || isListMatch(rule.effects, call.effects, isAllow)) &&
    (rule.sources === undefined || isListMatch(rule.sources, call.sources, isAllow)) &&
    (rule.destinations === undefined ||
      isDestinationMatch(rule.destinations, call.destinations, isAllow)) &&
    (rule.checks === undefined ||
      rule.checks.every((check) => isCheckMet(check, call.args, isAllow)))
  );
}

function isToolMatch(pattern: string, tool: string): boolean {
  const [name = tool] = tool.split('/', 1);

  return isPatternMatch(pattern, tool) || isPatternMatch(pattern, name);
}

function isListMatch<Item>(
  listed: readonly Item[],
  held: readonly Item[],
  isAllow: boolean,
): boolean {
  return isAllow
    ? held.length > 0 && held.every((item) => listed.includes(item))
    : held.some((item) => listed.includes(item));
}

function isDestinationMatch(
  patterns: readonly string[],
  destinations: readonly string[],
  isAllow: boolean,
): boolean {
  const isFit = (destination: string): boolean =>
    patterns.some((pattern) => isPatternMatch(pattern, destination));

  return isAllow
    ? destinations.length > 0 && destinations.every((destination) => isFit(destination))
    : destinations.some((destination) => isFit(destination));
}

function isCheckMet(
  check: RuleCheck,
  args: Readonly<Record<string, unknown>>,
  isAllow: boolean,
): boolean {
  const value = findArgument(args, check.arg);
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];

  if (value === undefined || values.length === 0) {
    return false;
  }

  const isPassing = (item: unknown): boolean => isCheckPassed(check, item);

  return isAllow ? values.every((item) => isPassing(item)) : values.some((item) => isPassing(item));
}

function findArgument(args: Readonly<Record<string, unknown>>, path: string): unknown {
  let value: unknown = args;

  for (const part of path.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, part)) {
      return undefined;
    }

    value = Object.getOwnPropertyDescriptor(value, part)?.value;
  }

  return value;
}

function isCheckPassed(check: RuleCheck, value: unknown): boolean {
  return match(check)
    .with({ op: 'eq' }, (eq) => isSameScalar(eq.value, value))
    .with({ op: 'in' }, (within) => within.value.some((listed) => isSameScalar(listed, value)))
    .with(
      { op: 'matches' },
      (pattern) => typeof value === 'string' && isPatternMatch(pattern.value, value),
    )
    .exhaustive();
}

function isSameScalar(listed: string | number | boolean, value: unknown): boolean {
  return typeof listed === 'string' && typeof value === 'string'
    ? listed.normalize('NFC') === value.normalize('NFC')
    : listed === value;
}
