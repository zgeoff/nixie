import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { toCutText } from './to-cut-text';

test.each<[string, string, number, JSONObject]>([
  [
    'the whole text with cut false under the limit',
    'short reply',
    20,
    { text: 'short reply', cut: false },
  ],
  ['the whole text with cut false at the limit', 'abcde', 5, { text: 'abcde', cut: false }],
  [
    'the end of the text with cut true past the limit',
    `${'a'.repeat(5)}${'b'.repeat(10)}`,
    10,
    { text: 'b'.repeat(10), cut: true },
  ],
])('it gives %s', (_label, text, limit, cutText) => {
  expect(toCutText(text, limit)).toStrictEqual(cutText);
});
