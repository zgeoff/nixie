import { expect, test } from 'bun:test';
import { buildKeyNames } from './build-key-names';

test.each([
  [['enter'], 'Return', 'Enter'],
  [['ctrl', 'shift', 'n'], 'ctrl+shift+n', 'Control+Shift+n'],
  [['shift', 'tab'], 'shift+Tab', 'Shift+Tab'],
  [['f6'], 'F6', 'F6'],
  [['pagedown'], 'Next', 'PageDown'],
])('it names the chord %p for each keyboard', (chord, xChord, browserChord) => {
  expect([buildKeyNames(chord, 'x'), buildKeyNames(chord, 'browser')]).toStrictEqual([
    xChord,
    browserChord,
  ]);
});
