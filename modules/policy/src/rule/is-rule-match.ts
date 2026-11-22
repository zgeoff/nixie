import { match } from 'ts-pattern';
import type { Rule, RuleCall, RuleCheck } from '../types';
import { findArgument } from './find-argument';
import { isCommandMatch, isCommandMentioned } from './is-command-match';
import { isPatternMatch } from './is-pattern-match';
import { toCheckPatterns } from './to-check-patterns';

export function isRuleMatch(rule: Rule, call: RuleCall): boolean {
  const isAllow = rule.outcome === 'allow';

  if (rule.cel !== undefined && isAllow) {
    return false;
  }

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

const commandTool = 'computer.run';

function isCheckMet(check: RuleCheck, call: RuleCall, isAllow: boolean): boolean {
  const value = findArgument(call.args, check.arg);
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];

  if (value === undefined || values.length === 0) {
    return false;
  }

  const isCommand = call.tool === commandTool && check.arg === 'command';
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
      (pattern) =>
        typeof value === 'string' && isMatches(toCheckPatterns(pattern.value), value, read),
    )
    .with(
      { op: 'excludes' },
      (pattern) =>
        typeof value === 'string' && isClearOf(toCheckPatterns(pattern.value), value, read),
    )
    .exhaustive();
}

function isSameScalar(listed: string | number | boolean, value: unknown): boolean {
  return typeof listed === 'string' && typeof value === 'string'
    ? listed.normalize('NFC') === value.normalize('NFC')
    : listed === value;
}

// A command that a rule reads as a syntax tree passes an allow rule only when it is plain commands,
// each matching one of the patterns, and a deny or ask rule reads it more loosely, so a line the
// tree refuses still meets the rule.
function isMatches(patterns: readonly string[], value: string, read: CommandRead): boolean {
  if (!read.isCommand) {
    return patterns.some((pattern) => isPatternMatch(pattern, value));
  }

  return read.isAllow
    ? isCommandMatch(patterns, value)
    : patterns.some((pattern) => isCommandMentioned(pattern, value));
}

// Whether a value matches none of the patterns. For a command, an allow rule fails the check when any
// part of the line mentions a pattern, and a deny or ask rule only when every plain command matches
// one, so each outcome errs toward stopping the call.
function isClearOf(patterns: readonly string[], value: string, read: CommandRead): boolean {
  if (!read.isCommand) {
    return !patterns.some((pattern) => isPatternMatch(pattern, value));
  }

  return read.isAllow
    ? !patterns.some((pattern) => isCommandMentioned(pattern, value))
    : !isCommandMatch(patterns, value);
}
