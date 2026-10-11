import { expect, test } from 'bun:test';
import { resolveHostAddresses } from './resolve-host-addresses';

test('it returns every address of a host name', async () => {
  const addresses = await resolveHostAddresses('localhost');

  expect(addresses).toIncludeAnyMembers(['127.0.0.1', '::1']);
});

test('it rejects a host name that does not resolve', () => {
  expect(resolveHostAddresses('nothing.invalid')).rejects.toThrow();
});
