import { readCompiledCondition } from './read-compiled-condition';
import type { ConditionCheck, ConditionSource } from './types';

// Every path that accepts a rule with a condition calls this: the rules-file parser and
// rules.editProposedRule. It runs the note, the limits, the parse, the subset walk and the type
// check, then builds the view.
export function checkCondition(rule: ConditionSource): ConditionCheck {
  return readCompiledCondition(rule).check;
}
