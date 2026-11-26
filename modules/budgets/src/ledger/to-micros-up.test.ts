import { expect, test } from 'bun:test';
import { toMicrosUp } from './to-micros-up';

test.each([
  [0.41, 410_000],
  [0, 0],
  [1.2345678, 1_234_568],
  [0.0000001, 1],
  [12.4, 12_400_000],
])('it rounds %s dollars up to %s micros', (dollars, micros) => {
  expect(toMicrosUp(dollars)).toBe(micros);
});
