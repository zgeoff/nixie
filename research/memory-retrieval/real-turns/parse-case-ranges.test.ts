import { expect, test } from 'bun:test';
import { isInCaseRanges, parseCaseRanges } from './parse-case-ranges.ts';

test('#parseCaseRanges reads ranges and single cases', () => {
  expect(parseCaseRanges('t120-t180, t200')).toStrictEqual({
    ranges: [
      { from: 120, to: 180 },
      { from: 200, to: 200 },
    ],
  });
});

test('#parseCaseRanges returns each part that is not a case or a range', () => {
  expect(parseCaseRanges('t120-t180,120,tx')).toStrictEqual({ invalid: ['120', 'tx'] });
});

test.each([
  ['t120', true],
  ['t180', true],
  ['t181', false],
])('#isInCaseRanges answers %s with %p for t120-t180', (caseID, expected) => {
  expect(isInCaseRanges(caseID, [{ from: 120, to: 180 }])).toBe(expected);
});
