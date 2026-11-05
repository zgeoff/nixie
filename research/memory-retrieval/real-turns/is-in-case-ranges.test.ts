import { expect, test } from 'bun:test';
import { isInCaseRanges } from './is-in-case-ranges.ts';

test.each([
  ['t120', true],
  ['t180', true],
  ['t181', false],
])('it answers %s with %p for t120-t180', (caseID, expected) => {
  expect(isInCaseRanges(caseID, [{ from: 120, to: 180 }])).toBe(expected);
});
