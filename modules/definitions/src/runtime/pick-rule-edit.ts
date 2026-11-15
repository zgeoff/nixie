import type { Rule } from '@heynixie/policy';
import { pickRuleChange } from '@heynixie/policy';
import type { CurrentRuleVersion } from './read-current-rule';

export type RuleEditRequest =
  | { readonly action: 'remove'; readonly revision: number }
  | {
      readonly action: 'edit';
      readonly revision: number;
      readonly destinations: readonly string[];
    };

export type RuleEditPick =
  | { readonly status: 'write'; readonly rule: Omit<Rule, 'id'> | null; readonly reason: string }
  | { readonly status: 'unchanged' }
  | { readonly status: 'refused'; readonly code: 'NOT_FOUND' }
  | { readonly status: 'refused'; readonly code: 'CONFLICT'; readonly revision: number }
  | {
      readonly status: 'refused';
      readonly code: 'NOT_ALLOWED';
      readonly reason: 'widens' | 'empty' | 'mandate';
    };

// An owner's edit of a rule in force goes through only when it leaves the rule no wider.
export function pickRuleEdit(
  current: CurrentRuleVersion | null,
  request: RuleEditRequest,
): RuleEditPick {
  if (current === null) {
    return { status: 'refused', code: 'NOT_FOUND' };
  }

  if (current.revision !== request.revision) {
    return { status: 'refused', code: 'CONFLICT', revision: current.revision };
  }

  if (isMandateRule(current)) {
    return { status: 'refused', code: 'NOT_ALLOWED', reason: 'mandate' };
  }

  const { id: _id, ...body } = current.rule;

  if (request.action === 'remove') {
    return pickChange(current.rule, null, 'Undo of Always allow');
  }

  if (request.destinations.length === 0) {
    return { status: 'refused', code: 'NOT_ALLOWED', reason: 'empty' };
  }

  const edited = { ...body, destinations: [...request.destinations] };

  return pickChange(current.rule, edited, 'Edit of the destinations of a rule');
}

// A mandate's own rule changes only by ending the mandate. A rule of your definitions that holds
// the field is an ordinary rule.
function isMandateRule(current: CurrentRuleVersion): boolean {
  return (
    current.origin === 'nixie' &&
    current.rule.mandate !== undefined &&
    current.rule.id.startsWith(`${current.rule.mandate}-`)
  );
}

function pickChange(before: Rule, after: Omit<Rule, 'id'> | null, reason: string): RuleEditPick {
  const afterRule = after === null ? null : { ...after, id: before.id };
  const change = pickRuleChange(before, afterRule);

  if (change === 'widening') {
    return { status: 'refused', code: 'NOT_ALLOWED', reason: 'widens' };
  }

  return change === 'unchanged'
    ? { status: 'unchanged' }
    : { status: 'write', rule: after, reason };
}
