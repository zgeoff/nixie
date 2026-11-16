import { expect, test } from 'bun:test';
import { formatLateness } from './format-lateness';

test.each([
  [45, '1 minute'],
  [60, '1 minute'],
  [2700, '45 minutes'],
  [3600, '1 hour'],
  [7500, '2 hours 5 minutes'],
  [7260, '2 hours 1 minute'],
])('it formats %p seconds late as %p', (seconds, text) => {
  expect(formatLateness(seconds)).toBe(text);
});
