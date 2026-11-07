import { expect, test } from 'bun:test';
import { isPatternMatch } from './is-pattern-match';

test.each([
  ['an exact name', 'mail.send', 'mail.send', true],
  ['another exact name', 'mail.send', 'mail.reply', false],
  ['a domain pattern', '*@example.com', 'pat@example.com', true],
  ['a domain pattern on another domain', '*@example.com', 'pat@example.org', false],
  ['a domain pattern on a longer domain', '*@example.com', 'pat@example.com.evil', false],
  ['a prefix pattern', 'mail.*', 'mail.send', true],
  ['a prefix pattern on the bare prefix', 'mail.*', 'mail.', true],
  ['a middle wildcard', 'a*z', 'abcz', true],
  ['two wildcards in order', '*b*d*', 'abcde', true],
  ['two wildcards out of order', '*d*b*', 'abcde', false],
  ['overlapping ends', 'ab*ba', 'aba', false],
  ['the lone wildcard on empty text', '*', '', true],
  ['NFD text against an NFC pattern', 'café', 'cafe\u0301', true],
])('it answers %s', (_label, pattern, text, isMatch) => {
  expect(isPatternMatch(pattern, text)).toBe(isMatch);
});
