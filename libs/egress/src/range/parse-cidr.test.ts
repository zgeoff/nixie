import { expect, test } from 'bun:test';
import { parseCIDR } from './parse-cidr';

test('it reads the first and the last address of an IPv4 range', () => {
  expect(parseCIDR('10.0.4.0/24')).toStrictEqual({
    family: 4,
    first: 167_773_184n,
    last: 167_773_439n,
  });
});

test('it reads a range written with host bits as the range that holds them', () => {
  expect(parseCIDR('10.0.4.7/24')).toStrictEqual(parseCIDR('10.0.4.0/24'));
});

test.each(['10.0.4.0', '10.0.4.0/33', '10.0.4.0/x', 'nope/8', '10.0.4.0/8/8', '::1/129'])(
  'it refuses %s',
  (text) => {
    expect(parseCIDR(text)).toBeNull();
  },
);

test('it reads an IPv6 range', () => {
  expect(parseCIDR('::1/128')).toMatchObject({ family: 6, first: 1n, last: 1n });
});
