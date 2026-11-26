import { expect, test } from 'bun:test';
import { collectOwnerAddresses } from './collect-owner-addresses';

test('#collectOwnerAddresses lowercases each address and drops a repeat', () => {
  expect(
    collectOwnerAddresses(['Me@Example.test', 'me@example.test', 'work@example.org']),
  ).toStrictEqual(['me@example.test', 'work@example.org']);
});

test('#collectOwnerAddresses answers none for no connection', () => {
  expect(collectOwnerAddresses([])).toStrictEqual([]);
});
