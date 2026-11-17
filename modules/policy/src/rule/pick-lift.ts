import type { DecisionLift } from '@heynixie/log';
import { toMicros } from '../budget/to-micros';
import type { EffectDeclaration, RuleCall, RuleEntry } from '../types';
import { findArgument } from './find-argument';
import { isRuleMatch } from './is-rule-match';

// A call whose only always-ask effect is spend passes stage 4 when an allow rule that matches it
// holds a lift, and the call's amount is at most the lift's cap per action. Of several such rules,
// the first by ID names the lift.
export function pickLift(
  entries: readonly RuleEntry[],
  call: RuleCall,
  declaration: EffectDeclaration,
  askingEffects: readonly string[],
): DecisionLift | null {
  const amount = findAmountMicros(call, declaration);

  if (amount === null || askingEffects.some((effect) => effect !== 'spend')) {
    return null;
  }

  const lifting = entries
    .filter(
      (entry) =>
        entry.rule.outcome === 'allow' &&
        entry.rule.lift !== undefined &&
        amount <= toMicros(entry.rule.lift.perAction) &&
        isRuleMatch(entry.rule, call),
    )
    .toSorted((left, right) => (left.id < right.id ? -1 : 1));

  const [first] = lifting;

  return first?.rule.lift === undefined
    ? null
    : { ruleID: first.id, budgetID: first.rule.lift.budget, amountMicros: amount };
}

// The amount is a number of dollars in the argument that the declaration names.
function findAmountMicros(call: RuleCall, declaration: EffectDeclaration): number | null {
  if (declaration.amount === null) {
    return null;
  }

  const value = findArgument(call.args, declaration.amount);

  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? toMicros(value) : null;
}
