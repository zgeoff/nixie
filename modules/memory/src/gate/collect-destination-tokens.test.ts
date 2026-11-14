import { expect, test } from 'bun:test';
import { collectDestinationTokens } from './collect-destination-tokens';

test.each([
  ['a date with slashes', 'Moved in on 15/03/2024'],
  ['a date with hyphens', 'The lease starts 2024-03-15'],
  ['an amount with separators', 'Paid 123,456.78 for the car'],
  ['an amount after an account word', 'The account balance is 123456'],
  ['a bare 6-digit run', 'Order 482913 shipped'],
  ['a mobile number', 'Call 0412 345 678'],
  ['a number in 3, 3 and 4 digit groups', 'Call 212 555 0147'],
  ['a phone number with a country code', 'Call +61 412 345 678'],
  ['a phone number with a country code grouped like a BSB', 'Call +420 777 123 456'],
])('it finds no account number in %s', (_label, text) => {
  expect(collectDestinationTokens(text).filter((token) => token.kind === 'account')).toStrictEqual(
    [],
  );
});

test(
  'it collects 75,000 URLs on one line in linear time',
  () => {
    const tokens = collectDestinationTokens('https://a.co '.repeat(75_000));

    expect(tokens).toHaveLength(75_000);

    expect(tokens[74_999]).toStrictEqual({
      kind: 'url',
      key: 'https://a.co',
      raw: 'https://a.co',
    });
  },
  { timeout: 3000 },
);

test('it skips a token that lies inside one an earlier pattern found', () => {
  expect(
    collectDestinationTokens('Write to ops@harbour.example or see https://harbour.example/ops'),
  ).toStrictEqual([
    {
      kind: 'url',
      key: 'https://harbour.example/ops',
      raw: 'https://harbour.example/ops',
    },
    { kind: 'email', key: 'ops@harbour.example', raw: 'ops@harbour.example' },
  ]);
});

test('it finds a BSB and account number as one token whose part is the account number', () => {
  expect(collectDestinationTokens('Pay BSB 062-000 account no. 12345678 today')).toStrictEqual([
    {
      kind: 'account',
      key: '06200012345678',
      raw: '062-000 account no. 12345678',
      part: '12345678',
    },
  ]);
});

test('it finds a BSB and grouped account number as one token whose part joins the groups', () => {
  expect(collectDestinationTokens('Pay 062-000 account 1234 5678')).toStrictEqual([
    { kind: 'account', key: '06200012345678', raw: '062-000 account 1234 5678', part: '12345678' },
  ]);
});
