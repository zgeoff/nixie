import { expect, test } from 'bun:test';
import { parseCaseRangesOption } from './parse-case-ranges-option.ts';

test('it gives no ranges when the option is left out', () => {
  expect(parseCaseRangesOption(undefined)).toStrictEqual([]);
});

test('it gives the ranges of a valid option', () => {
  expect(parseCaseRangesOption('t120-t180,t200')).toStrictEqual([
    { from: 120, to: 180 },
    { from: 200, to: 200 },
  ]);
});

test('it rejects an option with a part that is not a case range, naming the part', () => {
  expect(() => parseCaseRangesOption('t120-t180,later')).toThrow(/not later$/u);
});
