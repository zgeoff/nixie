import { expect, test } from 'bun:test';
import { pickRegisteredOrigin } from './pick-registered-origin';

test.each([
  {
    title: 'an origin that matches the header',
    origin: 'https://nixie.example.org',
    header: 'https://nixie.example.org',
    expected: 'https://nixie.example.org',
  },
  {
    title: 'an origin with a trailing slash',
    origin: 'https://nixie.example.org/',
    header: 'https://nixie.example.org',
    expected: 'https://nixie.example.org',
  },
  {
    title: 'an origin on a port',
    origin: 'https://nixie.example.org:8443',
    header: 'https://nixie.example.org:8443',
    expected: 'https://nixie.example.org:8443',
  },
  {
    title: 'http',
    origin: 'http://nixie.example.org',
    header: 'http://nixie.example.org',
    expected: null,
  },
  {
    title: 'a path',
    origin: 'https://nixie.example.org/settings',
    header: 'https://nixie.example.org',
    expected: null,
  },
  {
    title: 'a query',
    origin: 'https://nixie.example.org?a=1',
    header: 'https://nixie.example.org',
    expected: null,
  },
  {
    title: 'a fragment',
    origin: 'https://nixie.example.org#top',
    header: 'https://nixie.example.org',
    expected: null,
  },
  {
    title: 'a user name',
    origin: 'https://wren@nixie.example.org',
    header: 'https://nixie.example.org',
    expected: null,
  },
  {
    title: 'an origin that differs from the header',
    origin: 'https://nixie.example.org',
    header: 'https://other.example.org',
    expected: null,
  },
  { title: 'no header', origin: 'https://nixie.example.org', header: undefined, expected: null },
  {
    title: 'text that is no URL',
    origin: 'nixie',
    header: 'https://nixie.example.org',
    expected: null,
  },
])('#pickRegisteredOrigin refuses or keeps $title', (row) => {
  expect(pickRegisteredOrigin(row.origin, row.header)).toBe(row.expected);
});
