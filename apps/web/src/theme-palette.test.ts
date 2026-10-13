import { expect, test } from 'bun:test';
import { buildContrastRatio } from './test-utils/build-contrast-ratio';
import { themePalette } from './theme-palette';

// WCAG AA asks normal-size text for a contrast ratio of at least 4.5 against its background.
test.each([
  ['light', 'text', 'canvas'],
  ['light', 'text', 'surface'],
  ['light', 'textMuted', 'canvas'],
  ['light', 'textMuted', 'surface'],
  ['light', 'link', 'canvas'],
  ['light', 'link', 'surface'],
  ['dark', 'text', 'canvas'],
  ['dark', 'text', 'surface'],
  ['dark', 'textMuted', 'canvas'],
  ['dark', 'textMuted', 'surface'],
  ['dark', 'link', 'canvas'],
  ['dark', 'link', 'surface'],
] as const)(
  'it gives the %s theme %s on %s at least WCAG AA contrast',
  (theme, text, background) => {
    const palette = themePalette[theme];

    expect(buildContrastRatio(palette[text], palette[background])).toBeGreaterThanOrEqual(4.5);
  },
);
