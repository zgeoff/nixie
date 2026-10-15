import { expect, test } from 'bun:test';
import { hasRoutableIPv6 } from './has-routable-ipv6';

test('it finds no routable IPv6 on an IPv4-only pod with a link-local IPv6 address', () => {
  expect(
    hasRoutableIPv6({
      lo: [
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '127.0.0.1/8',
        },
        {
          address: '::1',
          netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
          family: 'IPv6',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '::1/128',
          scopeid: 0,
        },
      ],
      eth0: [
        {
          address: '10.42.0.17',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '0a:58:0a:2a:00:11',
          internal: false,
          cidr: '10.42.0.17/24',
        },
        {
          address: 'fe80::858:aff:fe2a:11',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6',
          mac: '0a:58:0a:2a:00:11',
          internal: false,
          cidr: 'fe80::858:aff:fe2a:11/64',
          scopeid: 2,
        },
      ],
    }),
  ).toBe(false);
});

test('it finds routable IPv6 on a host with a unique local IPv6 address', () => {
  expect(
    hasRoutableIPv6({
      eth0: [
        {
          address: '192.0.2.10',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '52:54:00:12:34:56',
          internal: false,
          cidr: '192.0.2.10/24',
        },
      ],
      wg0: [
        {
          address: 'fd12:3456:789a::10',
          netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
          family: 'IPv6',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: 'fd12:3456:789a::10/128',
          scopeid: 0,
        },
      ],
    }),
  ).toBe(true);
});

test('it finds routable IPv6 on a host with a global IPv6 address', () => {
  expect(
    hasRoutableIPv6({
      eth0: [
        {
          address: '2001:db8:42::7',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6',
          mac: '52:54:00:12:34:56',
          internal: false,
          cidr: '2001:db8:42::7/64',
          scopeid: 0,
        },
      ],
    }),
  ).toBe(true);
});

test('it finds no routable IPv6 on a machine with no interfaces', () => {
  expect(hasRoutableIPv6({ eth0: undefined })).toBe(false);
});
