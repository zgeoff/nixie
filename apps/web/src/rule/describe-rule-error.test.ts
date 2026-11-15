import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { describeRuleError } from './describe-rule-error';

test('it lists each fault the host found in the rule', () => {
  const error = new ORPCError('INVALID', { data: { faults: ['tools: empty', 'checks: bad'] } });

  expect(describeRuleError(error)).toStrictEqual(['tools: empty', 'checks: bad']);
});

test('it gives a line for an invalid rule that names no fault', () => {
  expect(describeRuleError(new ORPCError('INVALID', { data: {} }))).toStrictEqual([
    'The rule breaks the rule format, so nothing changed.',
  ]);
});

test.each([
  ['CONFLICT', 'This changed since the card showed it, so nothing changed. Check the new version.'],
  ['CLOSED', 'This was answered, withdrawn or lapsed, so nothing changed.'],
  ['NOT_FOUND', 'This is gone, so nothing changed.'],
])('it says what a %s refusal means', (code, line) => {
  expect(describeRuleError(new ORPCError(code))).toStrictEqual([line]);
});

test('it falls back to a retry line for an error that is not a refusal', () => {
  expect(describeRuleError(new TypeError('network'))).toStrictEqual([
    'The call did not finish, so nothing changed. Try again.',
  ]);
});
