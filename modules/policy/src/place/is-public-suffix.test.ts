import { expect, test } from 'bun:test';
import { isPublicSuffix } from './is-public-suffix';

test.each<[string, string, boolean]>([
  ['an ICANN suffix', 'co.uk', true],
  ['a private suffix', 'github.io', true],
  ['a registrable domain', 'example.org', false],
  ['a one-label name that the list does not hold', 'localhost', false],
  ['an IP address', '10.0.0.1', false],
])('#isPublicSuffix answers for %s', (_name, domain, expected) => {
  expect(isPublicSuffix(domain)).toBe(expected);
});
