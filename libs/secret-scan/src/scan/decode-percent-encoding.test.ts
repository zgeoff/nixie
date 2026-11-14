import { expect, test } from 'bun:test';
import { decodePercentEncoding } from './decode-percent-encoding';

test.each([
  ['a plain escape', 'a%20b', 'a b'],
  ['a lower-case escape', 'a%2fb', 'a/b'],
  ['a multi-byte character', 'caf%C3%A9', 'café'],
  ['text with no escape', 'plain', 'plain'],
  ['a lone percent sign', '100%', '100%'],
  ['a percent sign before a non-hex pair', 'a%zzb', 'a%zzb'],
  ['a percent sign with one hex digit', 'a%2', 'a%2'],
  ['bytes that are not UTF-8', 'a%FFb', 'a�b'],
  ['a byte order mark inside the text', 'a%EF%BB%BFb', 'a\uFEFFb'],
  ['a byte order mark at the start of a run', '%EF%BB%BFb', '\uFEFFb'],
  ['a truncated multi-byte sequence', 'a%E2%82b', 'a�b'],
])('it decodes %s without throwing', (_name, input, expected) => {
  expect(decodePercentEncoding(input)).toBe(expected);
});
