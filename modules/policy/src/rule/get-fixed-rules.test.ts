import { expect, test } from 'bun:test';
import { getFixedRules } from './get-fixed-rules';

test('it lists the test rule, then the queue check rule, in a test build', () => {
  expect(getFixedRules().map((rule) => rule.id)).toStrictEqual([
    'test.allow-send',
    'slice1.queue-check',
  ]);
});

test('it holds no rule that names task.define or task.undefine', () => {
  const tools = getFixedRules().flatMap((entry) => entry.rule.tools ?? []);

  expect(tools).not.toIncludeAnyMembers(['task.define', 'task.undefine']);
});
