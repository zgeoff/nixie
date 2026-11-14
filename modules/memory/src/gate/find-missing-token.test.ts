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
  [
    'a BSB and account number with other separators',
    'Rent goes to 062-000 12345678',
    'BSB and account are 062000 12345678',
  ],
  [
    'a BSB and account number with an account word between',
    'Rent goes to BSB 062-000, account 12345678',
    'pay the rent to 062-000 12345678',
  ],
  [
    'an account number after another account word',
    'Account number: 4821 7730',
    'my acct is 48217730',
  ],
  [
    'a BSB and account number whose account digits the quote groups otherwise',
    'Pay 062-000 12345678',
    'Pay 062-000 1234 5678',
  ],
  [
    'a BSB and account number whose account digits the memory groups otherwise',
    'Pay 062-000 1234 5678',
    'Pay 062-000 12345678',
  ],
  [
    'an international phone number that the quote groups like a BSB',
    'Call +420777123456',
    'Call +420 777 123 456',
  ],
  [
    'an international phone number that the memory groups like a BSB',
    'Call +420 777 123 456',
    'Call +420777123456',
  ],
  [
    'an account number that a quoted BSB and account number holds',
    'Account number is 12345678',
    'BSB 062-000 account number: 12345678',
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

test('it finds a short account number that the quote lacks', () => {
  expect(
    findMissingToken('Bank account number is 123456', 'Use my usual bank account'),
  ).toMatchObject({ kind: 'account', key: '123456' });
});

test('it finds a BSB and account number that differs from the quoted one', () => {
  expect(
    findMissingToken('Rent goes to 062-000 87654321', 'Rent goes to 062-000 12345678'),
  ).toMatchObject({ kind: 'account', key: '06200087654321' });
});

test.each([
  [
    'an account number grouped like a BSB',
    'Account 123456 123456 9876',
    'Account 123456 123456 1111',
  ],
  ['a BSB after another digit group', 'Pays 11 062-000 12345678', 'Pays 22 062-000 12345678'],
])('it compares the whole of %s', (_label, text, quote) => {
  expect(findMissingToken(text, quote)).not.toBeNull();
});

test('it finds a BSB that the quote lacks beside a quoted account number', () => {
  expect(findMissingToken('Pays 062-000 12345678', 'account number: 12345678')).toMatchObject({
    kind: 'account',
    key: '06200012345678',
  });
});

test('it finds a BSB that the quote lacks beside a grouped account number after an account word', () => {
  expect(findMissingToken('Pay 062-000 account 1234 5678', 'Pay account 12345678')).toMatchObject({
    kind: 'account',
    key: '06200012345678',
  });
});
