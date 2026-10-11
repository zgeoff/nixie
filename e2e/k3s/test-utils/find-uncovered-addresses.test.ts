import { expect, test } from 'bun:test';
import { findUncoveredAddresses } from './find-uncovered-addresses';

test('it finds each address that no network or single address covers', () => {
  expect(
    findUncoveredAddresses(
      ['10.42.0.7', '10.43.218.178', '192.0.2.10', '192.0.2.11', '172.17.0.2'],
      ['10.42.0.0/16', '10.43.0.0/16', '192.0.2.10'],
    ),
  ).toStrictEqual(['192.0.2.11', '172.17.0.2']);
});

test('it checks IPv6 addresses against IPv6 networks', () => {
  expect(
    findUncoveredAddresses(['fd00:42::7', '2001:db8::1'], ['fd00:42::/56', '10.42.0.0/16']),
  ).toStrictEqual(['2001:db8::1']);
});

test('it refuses a range that is not an address or a network', () => {
  expect(() => findUncoveredAddresses(['10.42.0.7'], ['pods/16'])).toThrowWithMessage(
    Error,
    'pods/16 is not an address or a network',
  );
});
