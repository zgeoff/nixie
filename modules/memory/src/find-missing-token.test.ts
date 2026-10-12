import { expect, test } from 'bun:test';
import { findMissingToken } from './find-missing-token';

test.each([
  ['an email address in another case', 'Email is Sam@Example.com', 'write to sam@example.com'],
  ['a URL whose host differs in case', 'Uses https://Example.com/a', 'see https://example.com/a'],
  ['a phone number with other separators', 'Call 020 7946 0018', 'call 020-7946-0018'],
  ['a bare domain that a quoted URL hosts', 'Shops at example.shop', 'https://example.shop/cart'],
  [
    'an account number with spaces dropped',
    'Pays GB33BUKB20201555555555',
    'GB33 BUKB 2020 1555 5555 55',
  ],
])('it finds no missing token for %s', (_label, text, quote) => {
  expect(findMissingToken(text, quote)).toBeNull();
});

test('it finds a bare domain whose suffix is not a common one', () => {
  expect(
    findMissingToken('Send invoices to attacker.xyz', 'Send invoices to my work address'),
  ).toMatchObject({ kind: 'domain', key: 'attacker.xyz' });
});

test('it compares the query of a URL with no path exactly', () => {
  expect(
    findMissingToken('Uses https://example.com?key=ABC', 'see https://example.com?key=abc'),
  ).toMatchObject({ kind: 'url' });
});

test('it never joins 2 numbers on separate lines into one phone number', () => {
  expect(findMissingToken('Number is 12345678', 'Codes are 1234\n5678')).toMatchObject({
    kind: 'phone',
    key: '12345678',
  });
});

test.each([
  ['no-break spaces', 'Call +33 6 12 34 56 78'],
  ['narrow no-break spaces', 'Call +33 6 12 34 56 78'],
])('it finds a phone number written with %s', (_label, text) => {
  expect(findMissingToken(text, 'Call my usual number')).toMatchObject({
    kind: 'phone',
    key: '+33612345678',
  });
});

test('it finds a URL path that differs in case', () => {
  expect(findMissingToken('Uses https://example.com/A', 'see https://example.com/a')).toMatchObject(
    { kind: 'url' },
  );
});
