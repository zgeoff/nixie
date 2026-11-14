import { expect, test } from 'bun:test';
import { parseDuration } from './parse-duration';

test.each([
  ['500ms', 500],
  ['5s', 5000],
  ['10m', 600_000],
  ['24h', 86_400_000],
  ['2d', 172_800_000],
])('it reads %s as %d milliseconds', (text, expected) => {
  expect(parseDuration(text)).toBe(expected);
});

test.each(['', '5', 's', '0s', '1.5h', '-1h', '5 s', '5w'])('it refuses "%s"', (text) => {
  expect(parseDuration(text)).toBeNull();
});
