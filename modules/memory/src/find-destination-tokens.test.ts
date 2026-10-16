import { expect, test } from 'bun:test';
import { findDestinationTokens } from './find-destination-tokens';

test.each([
  ['a date with slashes', 'Moved in on 15/03/2024'],
  ['a date with hyphens', 'The lease starts 2024-03-15'],
  ['an amount with separators', 'Paid 123,456.78 for the car'],
  ['an amount after an account word', 'The account balance is 123456'],
  ['a bare 6-digit run', 'Order 482913 shipped'],
  ['a mobile number', 'Call 0412 345 678'],
  ['a number in 3, 3 and 4 digit groups', 'Call 212 555 0147'],
  ['a phone number with a country code', 'Call +61 412 345 678'],
])('it finds no account number in %s', (_label, text) => {
  expect(findDestinationTokens(text).filter((token) => token.kind === 'account')).toStrictEqual([]);
});

test('it finds a BSB and account number as one token and the account number as another', () => {
  expect(findDestinationTokens('Pay BSB 062-000 account no. 12345678 today')).toStrictEqual([
    { kind: 'account', key: '06200012345678', raw: '062-000 account no. 12345678' },
    { kind: 'account', key: '12345678', raw: '12345678' },
  ]);
});
