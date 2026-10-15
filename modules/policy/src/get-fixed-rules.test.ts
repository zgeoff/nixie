import { expect, test } from 'bun:test';
import { getFixedRules } from './get-fixed-rules';

test('it puts the test rule, then the queue check rule, before the read-only rule in a test build', () => {
  expect(getFixedRules().map((rule) => rule.id)).toStrictEqual([
    'test.allow-send',
    'slice1.queue-check',
    'slice1.read-only',
  ]);
});
