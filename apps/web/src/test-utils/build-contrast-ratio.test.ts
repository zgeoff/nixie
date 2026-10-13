import { expect, test } from 'bun:test';
import { buildContrastRatio } from './build-contrast-ratio';

test.each([
  ['#000000', '#ffffff', 21],
  ['#ffffff', '#000000', 21],
  ['#777777', '#777777', 1],
  ['#767676', '#ffffff', 4.54],
  ['#ff0000', '#ffffff', 4],
] as const)('it gives %s on %s a WCAG contrast ratio of %p', (foreground, background, expected) => {
  expect(buildContrastRatio(foreground, background)).toBeCloseTo(expected, 2);
});
