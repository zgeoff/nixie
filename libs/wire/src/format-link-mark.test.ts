import { expect, test } from 'bun:test';
import { formatLinkMark } from './format-link-mark';

test('it writes the index between the two private-use mark characters', () => {
  expect(formatLinkMark(7)).toBe('\u{E000}7\u{E001}');
});
