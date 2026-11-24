import { expect, test } from 'bun:test';
import { makeAddressCheck } from './make-address-check';
import { pickConnectAddress } from './pick-connect-address';

test.each([
  {
    label: 'no address',
    addresses: [],
    expected: { kind: 'refused', reason: 'maps.test resolves to no address' },
  },
  {
    label: 'a non-public address',
    addresses: ['10.0.0.7'],
    expected: {
      kind: 'refused',
      reason: 'maps.test resolves to 10.0.0.7, which is not a public address',
    },
  },
  {
    label: 'a non-public address among public ones',
    addresses: ['93.184.216.34', '10.0.0.7'],
    expected: {
      kind: 'refused',
      reason: 'maps.test resolves to 10.0.0.7, which is not a public address',
    },
  },
  {
    label: 'a loopback IPv6 address, which is not public rather than IPv6 only',
    addresses: ['::1'],
    expected: {
      kind: 'refused',
      reason: 'maps.test resolves to ::1, which is not a public address',
    },
  },
  {
    label: 'only public IPv6 addresses',
    addresses: ['2606:4700::1111', '2606:4700::1001'],
    expected: {
      kind: 'refused',
      reason: 'maps.test has no IPv4 address, and nixie reaches IPv4 hosts only',
    },
  },
  {
    label: 'a public IPv4 address',
    addresses: ['93.184.216.34'],
    expected: { kind: 'connect', address: '93.184.216.34' },
  },
  {
    label: 'an IPv6 address listed before an IPv4 one',
    addresses: ['2606:4700::1111', '93.184.216.34'],
    expected: { kind: 'connect', address: '93.184.216.34' },
  },
])('it picks for $label', (row) => {
  expect(pickConnectAddress('maps.test', row.addresses, makeAddressCheck([]))).toStrictEqual(
    row.expected,
  );
});
