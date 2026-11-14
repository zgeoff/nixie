import { expect, test } from 'bun:test';
import { findHiddenCharacter } from './find-hidden-character';

test.each([
  ['a right-to-left override', 0x20_2e, 'U+202E'],
  ['a right-to-left isolate', 0x20_67, 'U+2067'],
  ['a zero-width space', 0x20_0b, 'U+200B'],
  ['a byte order mark', 0xfe_ff, 'U+FEFF'],
  ['a tag character', 0xe_00_41, 'U+E0041'],
  ['a variation selector from the supplement', 0xe_01_00, 'U+E0100'],
  ['an escape control character', 0x1b, 'U+001B'],
])('it finds %s and names its line and code point', (_label, codePoint, name) => {
  const text = `# Steps\n\nRun the ${String.fromCodePoint(codePoint)}script.\n`;

  expect(findHiddenCharacter(text)).toStrictEqual({ line: 3, codePoint: name });
});

test('it finds nothing in text with tabs, CRLF endings, accents and an emoji warning sign', () => {
  const text = `# Étapes\r\n\tRun it ${String.fromCodePoint(0x26_a0, 0xfe_0f)} once.\r\n`;

  expect(findHiddenCharacter(text)).toBeNull();
});
