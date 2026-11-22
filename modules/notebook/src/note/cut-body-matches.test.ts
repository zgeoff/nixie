import { expect, test } from 'bun:test';
import { cutBodyMatches } from './cut-body-matches';

test('it keeps every match that fits the budget', () => {
  const matches = [
    { part: 1, text: 'one' },
    { part: 2, text: 'two' },
  ];

  expect(cutBodyMatches(matches, 1000)).toStrictEqual(matches);
});

test('it drops the matches after the budget runs out and keeps the first', () => {
  const matches = [
    { part: 3, text: 'a'.repeat(300) },
    { part: 4, text: 'b'.repeat(300) },
  ];

  expect(cutBodyMatches(matches, 400)).toStrictEqual([{ part: 3, text: 'a'.repeat(300) }]);
});

test('it shortens a first match that alone passes the budget', () => {
  const matches = [{ part: 2, text: 'x'.repeat(5000) }];
  const cut = cutBodyMatches(matches, 500);

  expect(cut).toHaveLength(1);
  expect(cut[0]?.part).toBe(2);
  expect(Buffer.byteLength(JSON.stringify(cut))).toBeLessThanOrEqual(500);
  expect(cut[0]?.text.endsWith('…')).toBe(true);
});
