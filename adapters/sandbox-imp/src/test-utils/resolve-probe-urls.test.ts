import { expect, test } from 'bun:test';
import { resolveProbeURLs } from './resolve-probe-urls';

test('it gives an IPv4 address its own URL on the port', async () => {
  const urls = await resolveProbeURLs('127.0.0.1', 7070);

  expect(urls).toStrictEqual(['http://127.0.0.1:7070/']);
});

test('it brackets an IPv6 address', async () => {
  const urls = await resolveProbeURLs('::1', 80);

  expect(urls).toStrictEqual(['http://[::1]:80/']);
});

test('it resolves a name to a URL for each of its addresses', async () => {
  const urls = await resolveProbeURLs('localhost', 8080);

  expect(urls).toContain('http://127.0.0.1:8080/');
});
