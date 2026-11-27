import { match } from 'ts-pattern';
import { evaluateCondition } from '../condition/evaluate-condition';
import { pickRuleAliasTool } from '../memory/pick-rule-alias-tool';
import type { Rule, RuleCall, RuleCheck } from '../types';
import { toolShapes } from '../utils/tool-shapes';
import { findArgument } from './find-argument';
import { isCommandMatch, isCommandMentioned } from './is-command-match';
import { isDestinationPatternMatch } from './is-destination-pattern-match';
import { isPatternMatch } from './is-pattern-match';

export type RuleMatch =
  | { readonly kind: 'match' }
  | { readonly kind: 'miss' }
  | { readonly kind: 'error'; readonly code: string; readonly missing?: string };

// A rule matches a call when every fixed field matches and then the condition is true. A condition
// that errors is no match for an allow, and counts as a match for an ask. A deny whose condition
// errors is no match here; the decision point sets it aside and asks.
export function isRuleMatch(rule: Rule, call: RuleCall): boolean {
  const matched = matchRule(rule, call);

  return matched.kind === 'match' || (matched.kind === 'error' && rule.outcome === 'ask');
}

export function matchRule(rule: Rule, call: RuleCall): RuleMatch {
  if (!isFixedMatch(rule, call)) {
    return { kind: 'miss' };
  }

  if (rule.cel === undefined) {
    return { kind: 'match' };
  }

  const result = evaluateCondition(rule, call);

  return match(result)
    .with({ kind: 'true' }, (): RuleMatch => ({ kind: 'match' }))
    .with({ kind: 'false' }, (): RuleMatch => ({ kind: 'miss' }))
    .with({ kind: 'error' }, (failed): RuleMatch => failed)
    .exhaustive();
}

function isFixedMatch(rule: Rule, call: RuleCall): boolean {
  const isAllow = rule.outcome === 'allow';

  return (
    (rule.expires === undefined || call.at < Date.parse(rule.expires)) &&
    (rule.tools === undefined || rule.tools.some((pattern) => isToolMatch(pattern, call.tool))) &&
    (rule.contexts === undefined || rule.contexts.includes(call.context)) &&
    (rule.definitions === undefined ||
      (call.task !== null && rule.definitions.includes(call.task))) &&
    (rule.effects === undefined || isListMatch(rule.effects, call.effects, isAllow)) &&
    (rule.sources === undefined || isListMatch(rule.sources, call.sources, isAllow)) &&
    (rule.destinations === undefined ||
      isDestinationMatch(rule.destinations, call.destinations, isAllow)) &&
    (rule.checks === undefined || rule.checks.every((check) => isCheckMet(check, call, isAllow)))
  );
}

function isToolMatch(pattern: string, tool: string): boolean {
  const [name = tool] = tool.split('/', 1);
  const alias = pickRuleAliasTool(tool);

  return (
    isPatternMatch(pattern, tool) ||
    isPatternMatch(pattern, name) ||
    (alias !== null && isPatternMatch(pattern, alias))
  );
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
    patterns.some((pattern) => isDestinationPatternMatch(pattern, destination));

  return isAllow
    ? destinations.length > 0 && destinations.every((destination) => isFit(destination))
    : destinations.some((destination) => isFit(destination));
}

function isCheckMet(check: RuleCheck, call: RuleCall, isAllow: boolean): boolean {
  const value = findArgument(call.args, check.arg);
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];

  if (value === undefined || values.length === 0) {
    return false;
  }

  const isCommand = toolShapes
    .list()
    .some(
      (shape) =>
        shape.kind === 'command' && shape.tool === call.tool && shape.argument === check.arg,
    );

  const isPassing = (item: unknown): boolean => isCheckPassed(check, item, { isCommand, isAllow });

  return isAllow ? values.every((item) => isPassing(item)) : values.some((item) => isPassing(item));
}

interface CommandRead {
  readonly isCommand: boolean;
  readonly isAllow: boolean;
}

function isCheckPassed(check: RuleCheck, value: unknown, read: CommandRead): boolean {
  return match(check)
    .with({ op: 'eq' }, (eq) => isSameScalar(eq.value, value))
    .with({ op: 'in' }, (within) => within.value.some((listed) => isSameScalar(listed, value)))
    .with(
      { op: 'matches' },
      (pattern) => typeof value === 'string' && isMatches(pattern.value, value, read),
    )
    .exhaustive();
}

function isSameScalar(listed: string | number | boolean, value: unknown): boolean {
  return typeof listed === 'string' && typeof value === 'string'
    ? listed.normalize('NFC') === value.normalize('NFC')
    : listed === value;
}

// A command that a rule reads as a syntax tree passes an allow rule only when it is plain commands,
// and a deny or ask rule reads it more loosely, so a line the tree refuses still meets the rule.
function isMatches(pattern: string, value: string, read: CommandRead): boolean {
  if (!read.isCommand) {
    return isPatternMatch(pattern, value);
  }

  return read.isAllow ? isCommandMatch(pattern, value) : isCommandMentioned(pattern, value);
}
