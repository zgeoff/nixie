import { expect, test } from 'bun:test';
import { buildAllowVerdict } from './build-allow-verdict';

test('it builds the verdict of one allow rule that holds the checks it is given', () => {
  const verdict = buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]);

  expect(verdict).toStrictEqual({
    kind: 'rule-allow',
    rules: [{ id: 'rule-a', revision: 2, checks: [{ arg: 'subject', op: 'eq', value: 'self' }] }],
  });
});

test('it builds an allow rule with no checks by default', () => {
  expect(buildAllowVerdict().rules).toStrictEqual([{ id: 'rule-a', revision: 2, checks: [] }]);
});
