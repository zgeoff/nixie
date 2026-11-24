import { expect, test } from 'bun:test';
import { makeAddressCheck } from '@heynixie/egress';
import { planHop } from './plan-hop';

function setupTest(addresses: readonly string[]) {
  return {
    options: {
      checkAddress: makeAddressCheck([]),
      resolveHost: () => Promise.resolve(addresses),
      signal: new AbortController().signal,
    },
  };
}

test('it refuses a host that has only IPv6 addresses and says nixie reaches IPv4 hosts only', async () => {
  const ctx = setupTest(['2606:4700::1111']);

  const planned = await planHop('https://maps.test/search', ctx.options);

  expect(planned).toStrictEqual({
    kind: 'refused',
    reason: 'maps.test has no IPv4 address, and nixie reaches IPv4 hosts only',
  });
});

test('it connects to the IPv4 address of a host that lists an IPv6 address first', async () => {
  const ctx = setupTest(['2606:4700::1111', '93.184.216.34']);

  const planned = await planHop('https://maps.test/search', ctx.options);

  expect(planned).toStrictEqual({
    kind: 'connect',
    url: new URL('https://maps.test/search'),
    address: '93.184.216.34',
  });
});

test('it refuses a host with a non-public address and names the address', async () => {
  const ctx = setupTest(['10.0.0.7']);

  const planned = await planHop('https://maps.test/search', ctx.options);

  expect(planned).toStrictEqual({
    kind: 'refused',
    reason: 'maps.test resolves to 10.0.0.7, which is not a public address',
  });
});
