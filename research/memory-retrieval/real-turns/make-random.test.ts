import { expect, test } from 'bun:test';
import { makeRandom } from './make-random.ts';

test('it draws the same numbers from the same seed', () => {
  const first = makeRandom(7);
  const second = makeRandom(7);

  expect(Array.from({ length: 5 }, () => first())).toStrictEqual(Array.from({ length: 5 }, () => second()));
});

test('it draws numbers in the unit interval that do not repeat over a bootstrap of draws', () => {
  const random = makeRandom(1);
  const draws = Array.from({ length: 250_000 }, () => random());

  expect(draws.every((value) => value >= 0 && value < 1)).toBe(true);
  expect(new Set(draws).size).toBeGreaterThan(249_000);
});
