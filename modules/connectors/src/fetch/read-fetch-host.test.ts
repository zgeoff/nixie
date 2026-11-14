import { expect, test } from 'bun:test';
import { readFetchHost } from './read-fetch-host';

test.each([
  ['https://Registry.NPMjs.org/tidepool/latest', 'registry.npmjs.org'],
  ['http://example.com:8080/docs?page=2', 'example.com:8080'],
  ['https://example.org:443/', 'example.org'],
])('it reads the host of %s as %s', (url, host) => {
  expect(readFetchHost(url)).toBe(host);
});
