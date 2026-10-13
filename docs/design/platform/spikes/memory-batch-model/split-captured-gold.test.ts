import { expect, test } from 'bun:test';
import { splitCapturedGold } from './split-captured-gold.ts';

test('it scores a revision saying the pottery class ended as captured', () => {
  expect(
    splitCapturedGold(
      ['g10'],
      ['The owner had a weekly Saturday pottery class 10 to 12, which ended when the studio closed.'],
    ),
  ).toStrictEqual({ captured: ['g10'], partial: [] });
});

test('it scores an active item for the ongoing pottery class as partial', () => {
  expect(
    splitCapturedGold(['g10'], ['The owner has a weekly pottery class on Saturdays, 10 to 12.']),
  ).toStrictEqual({ captured: [], partial: ['g10'] });
});

test('it scores the pottery class as captured once its item is retired', () => {
  expect(
    splitCapturedGold(['g10'], ['The owner prefers afternoon meetings.']),
  ).toStrictEqual({ captured: ['g10'], partial: [] });
});

test('it scores a new address beside the old one as partial', () => {
  expect(
    splitCapturedGold(
      ['g7'],
      ['The owner lives at 7 Quay Street, Bristol BS1 4DJ.', 'The owner lives at 14 Elm Row, Bristol.'],
    ),
  ).toStrictEqual({ captured: [], partial: ['g7'] });
});

test('it scores a gold fact with no stale rule as captured', () => {
  expect(splitCapturedGold(['g4'], ['The owner drinks tea, not coffee.'])).toStrictEqual({
    captured: ['g4'],
    partial: [],
  });
});
