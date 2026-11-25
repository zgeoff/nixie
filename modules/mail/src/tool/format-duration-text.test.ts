import { expect, test } from 'bun:test';
import { formatDurationText } from './format-duration-text';

test.each([
  [60_000, '1m'],
  [1_800_000, '30m'],
  [7_200_000, '2h'],
  [604_800_000, '7d'],
  [90_000, '90s'],
  [1500, '1500ms'],
])('#formatDurationText writes %i ms as %s', (durationMs, text) => {
  expect(formatDurationText(durationMs)).toBe(text);
});
