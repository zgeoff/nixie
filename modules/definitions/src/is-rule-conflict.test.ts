import { expect, test } from 'bun:test';
import { isRuleConflict } from './is-rule-conflict';

test.each<[string, string | null, string | null, boolean]>([
  ['the definitions moved from the base', 'h-ask', 'h-ask-wider', true],
  ['the definitions deleted the rule', 'h-ask', null, true],
  ['the definitions added a rule over a runtime change', null, 'h-ask', true],
  ['the definitions still hold the base', 'h-ask', 'h-ask', false],
  ['neither holds the rule', null, null, false],
])('it reads a conflict when %s: %p', (_name, baseHash, definitionsHash, conflict) => {
  expect(isRuleConflict(baseHash, definitionsHash)).toBe(conflict);
});
