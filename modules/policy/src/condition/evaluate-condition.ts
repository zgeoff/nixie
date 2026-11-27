import type { Rule, RuleCall } from '../types';
import { buildConditionContext } from './build-condition-context';
import { readCompiledCondition } from './read-compiled-condition';
import type { ConditionResult } from './types';

// The result of a condition on a call never changes, so the decision point's stages share one
// evaluation per condition text.
const evaluated = new WeakMap<RuleCall, Map<string, ConditionResult>>();

// Called by isRuleMatch only after every fixed field matched.
export function evaluateCondition(
  rule: Pick<Rule, 'cel' | 'note'>,
  call: RuleCall,
): ConditionResult {
  if (rule.cel === undefined) {
    return { kind: 'true' };
  }

  const key = `${rule.note === undefined ? '-' : 'n'}${rule.cel}`;
  const held = evaluated.get(call) ?? new Map<string, ConditionResult>();
  const cached = held.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const result = runCondition(rule.cel, rule.note, call);

  held.set(key, result);
  evaluated.set(call, held);

  return result;
}

function runCondition(cel: string, note: string | undefined, call: RuleCall): ConditionResult {
  const compiled = readCompiledCondition({ cel, note });

  if (compiled.run === null) {
    return { kind: 'error', code: 'condition_invalid' };
  }

  const built = buildConditionContext(call);

  if (built.status === 'too_large') {
    return { kind: 'error', code: 'input_too_large' };
  }

  try {
    const value: unknown = compiled.run(built.context);

    return value === true ? { kind: 'true' } : toFalseOrError(value);
  } catch (error) {
    return toErrorResult(error);
  }
}

function toFalseOrError(value: unknown): ConditionResult {
  return value === false ? { kind: 'false' } : { kind: 'error', code: 'not_bool' };
}

const missingKeyPattern = /^No such key: (?<key>[A-Za-z_]\w{0,63})$/u;

function toErrorResult(error: unknown): ConditionResult {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

  const summary =
    typeof error === 'object' && error !== null && 'summary' in error ? error.summary : null;

  if (typeof code !== 'string') {
    return { kind: 'error', code: 'evaluation_failed' };
  }

  const missing =
    code === 'no_such_key' && typeof summary === 'string'
      ? missingKeyPattern.exec(summary)?.groups?.['key']
      : undefined;

  return missing === undefined ? { kind: 'error', code } : { kind: 'error', code, missing };
}
