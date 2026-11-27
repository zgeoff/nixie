import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { formatPlaceKey } from './format-place-key';
import { parsePlacePattern } from './parse-place-pattern';
import type { PlaceKey } from './types';

test.each<[string, string, PlaceKey | null]>([
  [
    'a host',
    'library.example.org',
    { kind: 'site', domain: 'library.example.org', subdomains: false },
  ],
  [
    'a host and its subdomains',
    '*.library.example.org',
    { kind: 'site', domain: 'library.example.org', subdomains: true },
  ],
  [
    'a mail domain',
    '@example.org',
    { kind: 'mail_domain', domain: 'example.org', subdomains: false },
  ],
  [
    'a mail domain and its subdomains',
    '@*.example.org',
    { kind: 'mail_domain', domain: 'example.org', subdomains: true },
  ],
  [
    'a mail domain keeps www',
    '@www.example.org',
    { kind: 'mail_domain', domain: 'www.example.org', subdomains: false },
  ],
  ['a whole public suffix', '*.github.io', null],
  ['a whole public suffix of mail', '@*.co.uk', null],
  ['an exact public suffix', 'github.io', { kind: 'site', domain: 'github.io', subdomains: false }],
  [
    'www typed on a site',
    'www.example.org',
    { kind: 'site', domain: 'example.org', subdomains: false },
  ],
  ['www twice', 'www.www.example.org', null],
  ['a mail domain with a query', '@example.org?query', null],
  ['a mail domain with a fragment', '@example.org#top', null],
  ['a mail domain with a backslash', String.raw`@example.org\path`, null],
  ['a one-label host', 'www.localhost', { kind: 'site', domain: 'localhost', subdomains: false }],
  [
    'a one-label host and its subdomains',
    '*.localhost',
    { kind: 'site', domain: 'localhost', subdomains: true },
  ],
  [
    'a custom scheme in mixed case',
    'custom://MiXeD.Example',
    { kind: 'site', domain: 'mixed.example', subdomains: false },
  ],
  ['an address', 'sam@example.org', { kind: 'address', address: 'sam@example.org' }],
  ['text that is no place', 'not a place', null],
])('#parsePlacePattern reads %s', (_name, text, expected) => {
  expect(parsePlacePattern(text)).toStrictEqual(expected);
});

test.each([
  'library.example.org',
  '*.library.example.org',
  '@example.org',
  '@*.example.org',
  'sam@example.org',
])('#formatPlaceKey gives %s back to parsePlacePattern unchanged', (text) => {
  const key = parsePlacePattern(text);

  invariant(key);

  expect(formatPlaceKey(key)).toBe(text);
});
