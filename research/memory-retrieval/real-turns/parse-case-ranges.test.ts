import { expect, test } from 'bun:test';
import { parseCaseRanges } from './parse-case-ranges.ts';

test('it reads ranges and single cases', () => {
  expect(parseCaseRanges('t120-t180, t200')).toStrictEqual({
    ranges: [
      { from: 120, to: 180 },
      { from: 200, to: 200 },
    ],
  });
});

test('it returns each part that is not a case or a range', () => {
  expect(parseCaseRanges('t120-t180,120,tx')).toStrictEqual({ invalid: ['120', 'tx'] });
});
