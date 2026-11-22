import { expect, test } from 'bun:test';
import { parseWindowClass } from './parse-window-class';

test('it reads a window class as lowercase words', () => {
  expect(parseWindowClass('WM_CLASS(STRING) = "xterm", "XTerm"')).toBe('xterm xterm');
});
