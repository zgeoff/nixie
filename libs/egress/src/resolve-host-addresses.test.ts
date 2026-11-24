import { expect, test } from 'bun:test';
import { resolveHostAddresses } from './resolve-host-addresses';

test('it returns every address of a host name', async () => {
  const addresses = await resolveHostAddresses('localhost');

  expect(addresses).toIncludeAnyMembers(['127.0.0.1', '::1']);
});

test('it rejects a host name that does not resolve', () => {
  expect(resolveHostAddresses('nothing.invalid')).rejects.toThrow();
});

test('it asks for the IPv6 records of a host that the system lookup finds no address for', async () => {
  const notFound = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });

  const addresses = await resolveHostAddresses('maps.test', {
    readAddresses: () => Promise.reject(notFound),
    readIPv6Records: () => Promise.resolve(['2606:4700::1111']),
  });

  expect(addresses).toStrictEqual(['2606:4700::1111']);
});

test('it rejects a host that has neither a lookup answer nor IPv6 records', () => {
  const notFound = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });

  expect(
    resolveHostAddresses('maps.test', {
      readAddresses: () => Promise.reject(notFound),
      readIPv6Records: () => Promise.reject(notFound),
    }),
  ).rejects.toThrow('not found');
});

test('it rejects a lookup failure that no missing address explains, without asking for IPv6 records', () => {
  const timeout = Object.assign(new Error('timed out'), { code: 'ETIMEOUT' });

  expect(
    resolveHostAddresses('maps.test', {
      readAddresses: () => Promise.reject(timeout),
      readIPv6Records: () => Promise.resolve(['2606:4700::1111']),
    }),
  ).rejects.toThrow('timed out');
});
