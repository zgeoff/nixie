import { expect, test } from 'bun:test';
import { pickStaticResponse, type StaticResponse } from './pick-static-response.ts';

test.each<[string, StaticResponse]>([
  ['/icons/launcher-192.png', { kind: 'icon', variant: 'launcher', size: 192 }],
  ['/icons/badge-96.png', { kind: 'icon', variant: 'badge', size: 96 }],
  ['/sw.js', { kind: 'asset', name: 'sw.js' }],
  ['/assets/block-1.js', { kind: 'asset', name: 'assets/block-1.js' }],
  [
    '/',
    {
      kind: 'file',
      path: '/srv/probe/public/index.html',
      contentType: 'text/html; charset=utf-8',
    },
  ],
  [
    '/manifest.webmanifest',
    {
      kind: 'file',
      path: '/srv/probe/public/manifest.webmanifest',
      contentType: 'application/manifest+json',
    },
  ],
])('it answers %s', (pathname, expected) => {
  expect(pickStaticResponse(pathname, '/srv/probe/public')).toStrictEqual(expected);
});

test.each([
  ['an icon size it never draws', '/icons/launcher-100.png'],
  ['a path out of the public folder', '/../server.ts'],
  ['an encoded path out of the public folder', '/%2e%2e/server.ts'],
  ['a file type it never serves', '/keys.json'],
  ['a script outside the bundle names', '/assets/../server.ts'],
])('it refuses %s', (_label, pathname) => {
  expect(pickStaticResponse(pathname, '/srv/probe/public')).toStrictEqual({
    kind: 'not-found',
  });
});
