import type { Rule, RuleChange, RuleOutcome } from '../types';
import { isRuleMatchInside } from './is-rule-match-inside';
import { toRuleForm } from './to-rule-form';

export function pickRuleChange(before: Rule | null, after: Rule | null): RuleChange {
  if (before === null || after === null) {
    return pickPresenceChange(before, after);
  }

  return mergeChanges(pickMatchChange(before, after), pickLiftChange(before.lift, after.lift));
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

function mergeChanges(first: RuleChange, second: RuleChange): RuleChange {
  if (first === 'widening' || second === 'widening') {
    return 'widening';
  }

  return first === 'narrowing' || second === 'narrowing' ? 'narrowing' : 'unchanged';
}

const strictness: Readonly<Record<RuleOutcome, number>> = { allow: 0, ask: 1, deny: 2 };

function pickMatchChange(before: Rule, after: Rule): RuleChange {
  if (JSON.stringify(toMatchForm(before)) === JSON.stringify(toMatchForm(after))) {
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

// The note and the mandate ID name a rule for you and change no call it matches. The lift changes
// what a matched call costs, so it is compared apart.
function toMatchForm(rule: Rule): Omit<Rule, 'note' | 'mandate' | 'lift'> {
  const { note: _note, mandate: _mandate, lift: _lift, ...form } = toRuleForm(rule);

  return form;
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

// An added lift, a higher cap per action and another budget widen. A removed lift and a lower cap
// narrow.
function pickLiftChange(before: Rule['lift'], after: Rule['lift']): RuleChange {
  if (before === undefined && after === undefined) {
    return 'unchanged';
  }

  if (before === undefined) {
    return 'widening';
  }

  if (after === undefined) {
    return 'narrowing';
  }

  if (before.budget !== after.budget || after.perAction > before.perAction) {
    return 'widening';
  }

  return after.perAction < before.perAction ? 'narrowing' : 'unchanged';
}
