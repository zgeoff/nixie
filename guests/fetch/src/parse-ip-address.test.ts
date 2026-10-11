import { expect, test } from 'bun:test';
import { parseIPAddress } from './parse-ip-address';

test.each<[string, 4 | 6, bigint]>([
  ['1.2.3.4', 4, 0x01_02_03_04n],
  ['::1', 6, 1n],
  ['::', 6, 0n],
  ['2001:db8::8:1', 6, 0x20_01_0d_b8_00_00_00_00_00_00_00_00_00_08_00_01n],
  ['::ffff:1.2.3.4', 6, 0xff_ff_01_02_03_04n],
  ['fe80::', 6, 0xfe_80n << 112n],
])('it parses %s as an IPv%d address', (text, family, value) => {
  expect(parseIPAddress(text)).toStrictEqual({ family, value });
});

test.each([['example.com'], ['1.2.3'], ['fe80::1%eth0'], ['']])(
  'it returns null for %p',
  (text) => {
    expect(parseIPAddress(text)).toBeNull();
  },
);
