import { expect, test } from 'bun:test';
import { formatCountdown } from './format-countdown';

test.each([
  { title: 'more than a day', secondsLeft: 2 * 86_400 + 3 * 3600 + 59, expected: '2d 3h' },
  { title: 'more than an hour', secondsLeft: 3600 + 2 * 60 + 5, expected: '1:02:05' },
  { title: 'less than an hour', secondsLeft: 9 * 60 + 7, expected: '9:07' },
  { title: 'less than a minute', secondsLeft: 12, expected: '0:12' },
  { title: 'a fraction of a second', secondsLeft: 0.2, expected: '0:01' },
  { title: 'the moment itself', secondsLeft: 0, expected: '0' },
  { title: 'a moment that passed', secondsLeft: -30, expected: '0' },
])('#formatCountdown shows $title as $expected', (row) => {
  expect(formatCountdown(1_000_000 + row.secondsLeft * 1000, 1_000_000)).toBe(row.expected);
});
