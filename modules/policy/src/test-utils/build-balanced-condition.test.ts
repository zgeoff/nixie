import { expect, test } from 'bun:test';
import { buildBalancedCondition } from './build-balanced-condition';

test('it joins 4 terms as a tree of depth 2', () => {
  expect(buildBalancedCondition(['a', 'b', 'c', 'd'], '||')).toBe('((a || b) || (c || d))');
});

test('it gives a lone term as it is', () => {
  expect(buildBalancedCondition(['a'], '&&')).toBe('a');
});

test('it gives true for no term', () => {
  expect(buildBalancedCondition([], '&&')).toBe('true');
});
