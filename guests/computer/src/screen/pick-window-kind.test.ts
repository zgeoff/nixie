import { expect, test } from 'bun:test';
import { pickWindowKind } from './pick-window-kind';

test.each([
  ['chromium chromium', 'browser'],
  ['chromium-browser chromium-browser', 'browser'],
  ['xterm xterm', 'terminal'],
  ['openbox openbox', 'other'],
  ['', 'other'],
] as const)('it picks the kind of the class %p', (windowClass, kind) => {
  expect(pickWindowKind(windowClass)).toBe(kind);
});
