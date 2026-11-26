import { expect, test } from 'bun:test';
import { makeRangeCheck } from './make-range-check';

test.each([
  { address: '10.20.4.9', passes: true },
  { address: '10.20.255.255', passes: true },
  { address: '10.21.0.1', passes: false },
  { address: '8.8.8.8', passes: false },
  { address: 'fd00::1', passes: false },
  { address: 'not an address', passes: false },
])('it checks $address against the range 10.20.0.0/16', (row) => {
  expect(makeRangeCheck('10.20.0.0/16')(row.address)).toBe(row.passes);
});

test('it passes nothing for a range that does not parse', () => {
  expect(makeRangeCheck('10.20.0.0')('10.20.0.1')).toBe(false);
});

test('it checks an IPv6 range', () => {
  expect(makeRangeCheck('fd00::/8')('fd12:3456::1')).toBe(true);
});
