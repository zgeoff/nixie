import { expect, test } from 'bun:test';
import { makeAddressCheck } from './make-address-check';

test.each([
  ['a public IPv4 address', '93.184.215.14'],
  ['a public IPv6 address', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
  ['an IPv4-mapped public address', '::ffff:93.184.215.14'],
  ['a NAT64 public address', '64:ff9b::5db8:d70e'],
  ['a 6to4 public address', '2002:5db8:d70e::1'],
  ['a Teredo address whose server and client are public', '2001:0:5db8:d70e::a247:28f1'],
])('it allows %s', (_label, address) => {
  expect(makeAddressCheck([])(address)).toBeTrue();
});

test.each([
  ['the IPv4 loopback', '127.0.0.1'],
  ['the top of the IPv4 loopback range', '127.255.255.254'],
  ['the IPv4 unspecified address', '0.0.0.0'],
  ['a 10/8 private address', '10.1.2.3'],
  ['a 172.16/12 private address', '172.31.255.1'],
  ['a 192.168/16 private address', '192.168.1.1'],
  ['the cloud metadata service', '169.254.169.254'],
  ['a shared address space address', '100.64.0.1'],
  ['a Tailscale address', '100.100.100.100'],
  ['an IPv4 multicast address', '224.0.0.1'],
  ['the IPv4 broadcast address', '255.255.255.255'],
  ['a reserved IPv4 address', '240.0.0.1'],
  ['an IPv4 documentation address', '192.0.2.10'],
  ['an IPv4 benchmarking address', '198.18.0.1'],
  ['the IPv6 loopback', '::1'],
  ['the IPv6 unspecified address', '::'],
  ['an IPv6 unique local address', 'fd7a:115c:a1e0::1'],
  ['an IPv6 link-local address', 'fe80::1'],
  ['an IPv6 multicast address', 'ff02::1'],
  ['an IPv6 discard address', '100::1'],
  ['an IPv6 documentation address', '2001:db8::1'],
  ['an IPv4-mapped loopback address', '::ffff:127.0.0.1'],
  ['an IPv4-mapped private address in hex', '::ffff:a00:1'],
  ['an IPv4-mapped metadata address', '::ffff:169.254.169.254'],
  ['an IPv4-compatible private address', '::10.0.0.1'],
  ['an IPv4-translated private address', '::ffff:0:10.0.0.1'],
  ['a NAT64 private address', '64:ff9b::10.0.0.1'],
  ['a NAT64 local-use address', '64:ff9b:1::5db8:d70e'],
  ['a 6to4 private address', '2002:a00:1::1'],
  ['a 6to4 loopback address', '2002:7f00:1::1'],
  ['a Teredo address whose client is private', '2001:0:5db8:d70e::f5ff:fffe'],
  ['a Teredo address whose server is private', '2001:0:a00:1::a247:28f1'],
  ['text that is not an address', 'example.com'],
  ['an IPv6 address with a zone ID', 'fe80::1%eth0'],
])('it refuses %s', (_label, address) => {
  expect(makeAddressCheck([])(address)).toBeFalse();
});

test.each([
  ['a public IPv4 address in a listed network', ['93.184.0.0/16'], '93.184.215.14'],
  ['a listed single IPv4 address', ['93.184.215.14'], '93.184.215.14'],
  [
    'a public IPv6 address in a listed network',
    ['2606:2800::/32'],
    '2606:2800:21f:cb07:6820:80da:af6b:8b2c',
  ],
  ['an IPv4-mapped address in a listed IPv4 network', ['93.184.0.0/16'], '::ffff:93.184.215.14'],
  ['a 6to4 address in a listed IPv4 network', ['93.184.0.0/16'], '2002:5db8:d70e::1'],
])('it refuses %s the deployment lists as internal', (_label, ranges, address) => {
  expect(makeAddressCheck(ranges)(address)).toBeFalse();
});

test('it allows a public address outside the listed networks', () => {
  expect(makeAddressCheck(['10.96.0.0/12', 'fd00::/8'])('93.184.215.14')).toBeTrue();
});

test.each([['10.0.0.0/33'], ['not-a-range'], ['10.0.0.0/x']])(
  'it refuses to start with the listed range %s',
  (range) => {
    expect(() => makeAddressCheck([range])).toThrowWithMessage(
      Error,
      `${range} is not an address or a network`,
    );
  },
);
