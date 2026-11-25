import { expect, test } from 'bun:test';
import { renderCutText } from './render-cut-text';

test.each([
  ['the whole text under the limit', 'short reply', 20, 'short reply'],
  ['the whole text at the limit', 'abcde', 5, 'abcde'],
  [
    'the end of the text after a line that says nixie cut it past the limit',
    `${'a'.repeat(5)}${'b'.repeat(10)}`,
    10,
    `[nixie cut the start of this text]\n${'b'.repeat(10)}`,
  ],
])('it renders %s', (_label, text, limit, rendered) => {
  expect(renderCutText(text, limit)).toBe(rendered);
});
