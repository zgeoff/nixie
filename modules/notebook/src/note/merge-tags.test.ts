import { expect, test } from 'bun:test';
import { hasEveryTag, mergeTags } from './merge-tags';

test('it merges tags that match ignoring case and keeps the first spelling', () => {
  expect(mergeTags(['Home', 'boiler', 'home', 'BOILER', 'garden'])).toStrictEqual([
    'Home',
    'boiler',
    'garden',
  ]);
});

test('it keeps an empty list empty', () => {
  expect(mergeTags([])).toStrictEqual([]);
});

test.each([
  [['Home', 'boiler'], ['home'], true],
  [['Home', 'boiler'], ['home', 'BOILER'], true],
  [['Home'], ['home', 'boiler'], false],
  [[], [], true],
] as const)('it answers %j holds every tag of %j: %s', (held, wanted, expected) => {
  expect(hasEveryTag(held, wanted)).toBe(expected);
});
