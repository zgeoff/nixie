import { isRuleMatchInside } from './is-rule-match-inside';
import { toRuleForm } from './to-rule-form';
import type { Rule, RuleChange, RuleOutcome } from './types';

const strictness: Readonly<Record<RuleOutcome, number>> = { allow: 0, ask: 1, deny: 2 };

export function pickRuleChange(before: Rule | null, after: Rule | null): RuleChange {
  if (before === null || after === null) {
    return pickPresenceChange(before, after);
  }

  if (JSON.stringify(toRuleForm(before)) === JSON.stringify(toRuleForm(after))) {
    return 'unchanged';
  }

  if (before.cel !== undefined || after.cel !== undefined) {
    return 'widening';
  }

  const isAfterInside = isRuleMatchInside(after, before);
  const isBeforeInside = isRuleMatchInside(before, after);

  if (before.outcome === after.outcome) {
    return pickSameOutcomeChange(after.outcome === 'allow', isAfterInside, isBeforeInside);
  }

  const isStricter = strictness[after.outcome] > strictness[before.outcome];

  return isStricter && (before.outcome === 'allow' || isBeforeInside) ? 'narrowing' : 'widening';
}

function pickPresenceChange(before: Rule | null, after: Rule | null): RuleChange {
  if (after !== null) {
    return after.outcome === 'allow' ? 'widening' : 'narrowing';
  }

  if (before !== null) {
    return before.outcome === 'allow' ? 'narrowing' : 'widening';
  }

  return 'unchanged';
}

function pickSameOutcomeChange(
  isAllow: boolean,
  isAfterInside: boolean,
  isBeforeInside: boolean,
): RuleChange {
  if (isAfterInside && isBeforeInside) {
    return 'unchanged';
  }

  return (isAllow ? isAfterInside : isBeforeInside) ? 'narrowing' : 'widening';
}
