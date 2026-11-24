import { expect, test } from 'bun:test';
import { isIPv6Only } from './is-ipv6-only';

test.each([
  { label: 'one IPv6 address', addresses: ['2606:4700::1111'], expected: true },
  {
    label: 'two IPv6 addresses',
    addresses: ['2606:4700::1111', '2606:4700::1001'],
    expected: true,
  },
  { label: 'one IPv4 address', addresses: ['93.184.216.34'], expected: false },
  {
    label: 'an IPv6 and an IPv4 address',
    addresses: ['2606:4700::1111', '93.184.216.34'],
    expected: false,
  },
  { label: 'no address', addresses: [], expected: false },
])('it says $label is IPv6 only: $expected', (row) => {
  expect(isIPv6Only(row.addresses)).toBe(row.expected);
});
