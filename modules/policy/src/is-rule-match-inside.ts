import { match } from 'ts-pattern';
import { isPatternInside } from './is-pattern-inside';
import { isPatternMatch } from './is-pattern-match';
import type { Rule, RuleCheck } from './types';

export function isRuleMatchInside(inner: Rule, outer: Rule): boolean {
  return (
    inner.cel === undefined &&
    outer.cel === undefined &&
    isSooner(inner.expires, outer.expires) &&
    isPatternListInside(inner.tools, outer.tools, isToolPatternInside) &&
    isSetInside(inner.effects, outer.effects) &&
    isSetInside(inner.contexts, outer.contexts) &&
    isSetInside(inner.definitions, outer.definitions) &&
    isSetInside(inner.sources, outer.sources) &&
    isPatternListInside(inner.destinations, outer.destinations, isPatternInside) &&
    (outer.checks ?? []).every((weak) =>
      (inner.checks ?? []).some((strong) => isCheckImplied(strong, weak)),
    )
  );
}

function isSooner(inner: string | undefined, outer: string | undefined): boolean {
  return outer === undefined || (inner !== undefined && Date.parse(inner) <= Date.parse(outer));
}

function isPatternListInside(
  inner: readonly string[] | undefined,
  outer: readonly string[] | undefined,
  isInside: (inner: string, outer: string) => boolean,
): boolean {
  if (outer === undefined) {
    return true;
  }

  return (
    inner !== undefined && inner.every((pattern) => outer.some((wide) => isInside(pattern, wide)))
  );
}

// A tool pattern matches a call by its whole name or by the tool before a variant, so an exact
// variant such as task.start/atc lies inside a pattern that matches its tool.
function isToolPatternInside(inner: string, outer: string): boolean {
  const [tool = inner] = inner.split('/', 1);

  return (
    isPatternInside(inner, outer) ||
    (inner.includes('/') && !inner.includes('*') && isPatternMatch(outer, tool))
  );
}

function isSetInside<Item>(
  inner: readonly Item[] | undefined,
  outer: readonly Item[] | undefined,
): boolean {
  if (outer === undefined) {
    return true;
  }

  return inner !== undefined && inner.every((item) => outer.includes(item));
}

function isCheckImplied(strong: RuleCheck, weak: RuleCheck): boolean {
  if (strong.arg !== weak.arg) {
    return false;
  }

  const values = match(strong)
    .with({ op: 'eq' }, (eq) => [eq.value])
    .with({ op: 'in' }, (within) => within.value)
    .with({ op: 'matches' }, () => null)
    .exhaustive();

  return match(weak)
    .with({ op: 'eq' }, (eq) => values?.length === 1 && isSameScalar(values[0], eq.value))
    .with(
      { op: 'in' },
      (within) =>
        values !== null &&
        values.every((value) => within.value.some((listed) => isSameScalar(value, listed))),
    )
    .with({ op: 'matches' }, (pattern) =>
      strong.op === 'matches'
        ? isPatternInside(strong.value, pattern.value)
        : values !== null &&
          values.every(
            (value) => typeof value === 'string' && isPatternMatch(pattern.value, value),
          ),
    )
    .exhaustive();
}

function isSameScalar(
  left: string | number | boolean | undefined,
  right: string | number | boolean,
): boolean {
  return typeof left === 'string' && typeof right === 'string'
    ? left.normalize('NFC') === right.normalize('NFC')
    : left === right;
}
