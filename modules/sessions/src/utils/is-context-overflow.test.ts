import { expect, test } from 'bun:test';
import { isContextOverflow } from './is-context-overflow';

test('it reads a turn that ended with the outcome overflow as an overflow', () => {
  expect(isContextOverflow({ outcome: 'overflow' })).toBeTrue();
});

test.each(['finished', 'stopped', 'limit', 'interrupted'] as const)(
  'it reads a turn that ended with the outcome %s as no overflow',
  (outcome) => {
    expect(isContextOverflow({ outcome })).toBeFalse();
  },
);
