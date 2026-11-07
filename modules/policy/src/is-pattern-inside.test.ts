import { expect, test } from 'bun:test';
import { isPatternInside } from './is-pattern-inside';

test.each([
  ['an exact text inside the same text', 'pat@example.com', 'pat@example.com', true],
  ['an exact text inside a pattern that matches it', 'pat@example.com', '*@example.com', true],
  ['an exact text outside a pattern', 'pat@example.org', '*@example.com', false],
  ['a pattern inside the lone wildcard', '*@example.com', '*', true],
  ['a narrower domain inside a wider one', '*@team.example.com', '*example.com', true],
  ['a wider domain outside a narrower one', '*example.com', '*@team.example.com', false],
  ['a pattern outside the exact text', '*@example.com', 'pat@example.com', false],
  ['two wildcards inside one', 'a*b*c', 'a*c', true],
  ['one wildcard outside two literal parts', 'a*c', 'a*b*c', false],
  ['the same pattern', 'mail.*', 'mail.*', true],
])('it answers %s', (_label, inner, outer, isInside) => {
  expect(isPatternInside(inner, outer)).toBe(isInside);
});
