import { expect, test } from 'bun:test';
import { parseChord } from './parse-chord';

test.each([
  ['enter', ['enter']],
  ['Return', ['enter']],
  ['shift+tab', ['shift', 'tab']],
  ['CTRL+A', ['ctrl', 'a']],
  ['shift+ctrl+n', ['ctrl', 'shift', 'n']],
  ['f6', ['f6']],
  ['control+alt+delete', ['ctrl', 'alt', 'delete']],
])('it reads the chord %s', (text, expected) => {
  expect(parseChord(text)).toStrictEqual(expected);
});

test.each(['', 'ctrl+', 'a+b', 'ctrl+ctrl+a', 'ctrl', 'hyper+a', 'f25', 'ctrl+shift'])(
  'it reads no chord from %p',
  (text) => {
    expect(parseChord(text)).toBeNull();
  },
);
