import { expect, test } from 'bun:test';
import { resolveTestHostAddresses } from './resolve-test-host-addresses';

test('it answers a .test host with a public address', async () => {
  const addresses = await resolveTestHostAddresses('kagi.test');

  expect(addresses).toStrictEqual(['93.184.216.34']);
});

test('it resolves an IP literal host as itself', async () => {
  const addresses = await resolveTestHostAddresses('127.0.0.1');

  expect(addresses).toStrictEqual(['127.0.0.1']);
});
